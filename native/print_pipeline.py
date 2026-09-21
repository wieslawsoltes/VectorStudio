"""Native ICC print conversion and explicit structural verification (not certification)."""
import sys,json,hashlib,subprocess,pathlib
from pypdf import PdfReader,PdfWriter
from pypdf.generic import RectangleObject
job=pathlib.Path(sys.argv[1]); config=json.loads((job/'job.json').read_text()); bleed=config['bleed']*.75
writer=PdfWriter()
inputs=[job/'prepared.pdf'] if config.get('prepared') else [job/f'page-{i}.pdf' for i in range(config['pages'])]
for input_file in inputs:
    for page in PdfReader(input_file).pages:
        w,h=float(page.mediabox.width),float(page.mediabox.height)
        if not (w>2*bleed and h>2*bleed):raise ValueError('Bleed leaves an invalid trim area')
        page.trimbox=RectangleObject([bleed,bleed,w-bleed,h-bleed]);page.bleedbox=RectangleObject([0,0,w,h]);writer.add_page(page)
with (job/'input.pdf').open('wb') as f:writer.write(f)
profile=job/'output.icc'
# An explicit output intent accompanies CMYK conversion.
escape=lambda s:str(s).replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
definition=f'''/ICCProfile ({escape(profile)}) def
[/Title (Vellum print export) /GTS_PDFXVersion (PDF/X-3:2002) /Trapped /False /DOCINFO pdfmark
[/_objdef {{icc_PDFX}} /type /stream /OBJ pdfmark
[{{icc_PDFX}} << /N 4 >> /PUT pdfmark
[{{icc_PDFX}} ICCProfile (r) file /PUT pdfmark
[/_objdef {{OutputIntent_PDFX}} /type /dict /OBJ pdfmark
[{{OutputIntent_PDFX}} << /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (Custom ICC output condition) /Info (User supplied CMYK ICC profile) /DestOutputProfile {{icc_PDFX}} >> /PUT pdfmark
[{{Catalog}} << /OutputIntents [{{OutputIntent_PDFX}}] >> /PUT pdfmark
'''
(job/'intent.ps').write_text(definition)
subprocess.run(['gs','-q','-dSAFER',f'--permit-file-read={profile}','-dPDFX','-dBATCH','-dNOPAUSE','-dPDFACompatibilityPolicy=2',f'-dRenderIntent={dict(perceptual=0,relative=1,saturation=2,absolute=3).get(config.get("intent"),1)}','-sColorConversionStrategy=CMYK','-sProcessColorModel=DeviceCMYK',f'-sOutputICCProfile={profile}','-sDEVICE=pdfwrite',f'-sOutputFile={job / "output.pdf"}',str(job/'intent.ps'),str(job/'input.pdf')],check=True,timeout=40,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
r=PdfReader(job/'output.pdf');issues=[];checks={}
checks['pageCount']=len(r.pages)==config['pages'];checks['pdfxDeclaration']=r.metadata.get('/GTS_PDFXVersion')=='PDF/X-3:2002';checks['notEncrypted']=not r.is_encrypted
intents=r.trailer['/Root'].get('/OutputIntents',[]);icc=None
for intent in intents:
    obj=intent.get_object()
    if obj.get('/S')=='/GTS_PDFX' and '/DestOutputProfile' in obj:icc=obj['/DestOutputProfile'].get_object()
checks['outputIntent']=icc is not None
checks['profileIdentity']=icc is not None and hashlib.sha256(icc.get_data()).digest()==hashlib.sha256(profile.read_bytes()).digest()
checks['cmykProfile']=icc is not None and icc.get('/N')==4 and icc.get_data()[16:20]==b'CMYK' and icc.get_data()[12:16]==b'prtr'
checks['pageBoxes']=True;checks['fontsEmbedded']=True;checks['noLiveTransparency']=True
seen=set()
def resources(res):
    if not res:return
    res=res.get_object()
    for ref in res.get('/Font',{}).get_object().values() if hasattr(res.get('/Font',{}),'get_object') else res.get('/Font',{}).values():
        font=ref.get_object();fonts=font.get('/DescendantFonts',[font])
        for f in fonts:
            desc=f.get_object().get('/FontDescriptor');desc=desc.get_object() if desc else {}
            if not any(k in desc for k in ['/FontFile','/FontFile2','/FontFile3']):checks['fontsEmbedded']=False
    for ref in (res.get('/ExtGState',{}).get_object() if hasattr(res.get('/ExtGState',{}),'get_object') else res.get('/ExtGState',{})).values():
        g=ref.get_object()
        if float(g.get('/ca',1))<1 or float(g.get('/CA',1))<1 or g.get('/SMask','/None')!='/None':checks['noLiveTransparency']=False
    for ref in (res.get('/XObject',{}).get_object() if hasattr(res.get('/XObject',{}),'get_object') else res.get('/XObject',{})).values():
        obj=ref.get_object();key=id(obj)
        if key in seen:continue
        seen.add(key)
        if '/SMask' in obj:checks['noLiveTransparency']=False
        resources(obj.get('/Resources'))
for page in r.pages:
    boxes=[page.mediabox,page.bleedbox,page.trimbox]
    if any(float(b.width)<=0 or float(b.height)<=0 for b in boxes):checks['pageBoxes']=False
    for outer,inner in zip(boxes,boxes[1:]):
        if any(float(v)<float(outer[i])-.01 for i,v in enumerate(inner) if i<2) or any(float(v)>float(outer[i])+.01 for i,v in enumerate(inner) if i>=2):checks['pageBoxes']=False
    resources(page.get('/Resources'))
report={'checks':checks,'structuralChecksPassed':all(checks.values()),'externalCertification':False,'standardCandidate':'PDF/X-3:2002','profileSHA256':hashlib.sha256(profile.read_bytes()).hexdigest(),'warnings':['Review separations, overprint, font appearance and rasterized transparency with your print provider. Named spot colors use process alternates. This report is not independent PDF/X certification.']}
(job/'report.json').write_text(json.dumps(report,indent=2))
if not report['structuralChecksPassed']:sys.exit(2)
