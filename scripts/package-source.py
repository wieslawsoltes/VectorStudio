"""Create a complete, credential-free source release from the checked-out commit."""
import pathlib,subprocess,sys,zipfile,json,hashlib
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path(sys.argv[1]).resolve();out.parent.mkdir(parents=True,exist_ok=True)
version=json.loads((root/'package.json').read_text())['version']
sha=subprocess.check_output(['git','rev-parse','--verify','HEAD'],cwd=root,text=True).strip()
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
files={p for p in tracked if p and not p.startswith(('.openai/','.sites-runtime/','.agents/','.codex/')) and not p.endswith('.pyc')}
for directory in ['packages/vector/dist','packages/vector/licenses']:
    files.update(str(p.relative_to(root)) for p in (root/directory).rglob('*') if p.is_file())
release=f'releases/vellum-studio-vector-{version}.tgz'
if not (root/release).exists():raise SystemExit('Pack the matching npm library first')
files.add(release)
manifest={'name':'Vellum Vector Studio','version':version,'source_commit':sha,'files':{}}
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for name in sorted(files):
        path=root/name
        if not path.is_file():continue
        data=path.read_bytes();manifest['files'][name]=hashlib.sha256(data).hexdigest()
        archive.write(path,'VellumVectorStudio/'+name)
    archive.writestr('VellumVectorStudio/RELEASE.json',json.dumps(manifest,indent=2))
with zipfile.ZipFile(out) as archive:
    bad=archive.testzip()
    if bad:raise SystemExit('Corrupt member '+bad)
print(json.dumps({'path':str(out),'bytes':out.stat().st_size,'files':len(manifest['files']),'commit':sha,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
