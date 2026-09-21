"""Reassemble the verified source transfer. No project data or credentials are restored."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePosixPath
import base64
import hashlib
import io
import json
import lzma
import os
import re
import tarfile
import time
import urllib.parse
import urllib.request

REPO = os.environ['GITHUB_REPOSITORY']
ROOT = Path.cwd()
PREFIX = '''c6cce7def6861712f3a3a896c6b15cf198057451
1ffba89f7b98cd6d0f09ebacf1cd2d95e34bae4a
a4d49feb4b0fe210ecd0b5194a41e21b31cd47e7
903d848cda0c3d46d5e776385a1dc64c6f6b822e
e53ed38970036627f6f949ed72d6b14722054008
8b0a0ba65306ec976968a53215f8806143f324c7
5857fe8d45e54d6d4e6e64b10968c35af44bee38
66950fed6268662fa8aa24d656e6352ff15431a8
9bb12a0d16407dc5cbef22b5673e18b399203cd9
4b25150bc1442bc28bf67295f043262ca76c2f85
d718dd048c263e92aec03ce4c0d5a9b7d6c4896d'''.split()
TAIL = '''3b1ade6caf7a584371e6da4bee0d83ae7b7c4e46
243f5ccb206a9643ca02ddc3814385de528c9754
9bbec0bbcb05f6a758327f7037e70371bf9a1a72
ddd8010bfd027e6284b6de30b3ad5d25f9fe9077
30c5906559de4fae58e21a34639c1c6def2941d5
9d945a5821cc630be8d87209771bcccc7851541a
842786ddd565f0d9c4ecbfa7c8d0c2249ac88f5b
4cdd4cdbc6cc8ed058b689519bb4414c55a02072'''.split()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def fetch_json(url, headers=None):
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers=headers or {'User-Agent': 'VectorStudio-source-verification'})
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)

def blob(sha):
    obj = fetch_json(f'https://api.github.com/repos/{REPO}/git/blobs/{sha}', {
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    })
    data = base64.b64decode(obj['content'])
    actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if actual != sha:
        raise ValueError('Blob integrity mismatch: ' + sha)
    return data

def path_for(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] in ('.git', '.github'):
        raise ValueError('Unsafe source path: ' + name)
    return ROOT.joinpath(*path.parts)

def extract(archive, allowed):
    count = 0
    for member in archive.getmembers():
        if member.name == 'TRANSFER.json':
            continue
        if not member.isfile() or member.name not in allowed:
            raise ValueError('Unexpected transfer member: ' + member.name)
        target = path_for(member.name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.extractfile(member).read())
        count += 1
    return count

with ThreadPoolExecutor(max_workers=8) as pool:
    objects = dict(zip(PREFIX + TAIL, pool.map(blob, PREFIX + TAIL)))
packed = b''.join(objects[s] for s in TAIL)
assert digest(packed) == '000a38f7041e8bebc9925075533003ec246176b526c5c986994d2156c128c153'
with tarfile.open(fileobj=io.BytesIO(lzma.decompress(packed)), mode='r:') as tail:
    metadata = json.load(tail.extractfile('TRANSFER.json'))
    assert metadata['sourceDigest'] == '9b1e1a1e8e34473b6845bd747aca0c572e681656ee854599f32b85ce72c06d95'
    allowed = set(metadata['sourcePaths'])
    decoder = lzma.LZMADecompressor()
    raw = decoder.decompress(b''.join(objects[s] for s in PREFIX))[:metadata['prefixEnd']]
    assert digest(raw) == metadata['prefixSha256']
    with tarfile.open(fileobj=io.BytesIO(raw + b'\0' * 1024), mode='r:') as prefix:
        assert extract(prefix, allowed) == metadata['prefixCount']
    extract(tail, allowed)

for patch in metadata['patches']:
    path = path_for(patch['path'])
    assert digest(path.read_bytes()) == patch['before'], patch['path']
    text = path.read_text()
    for start, end, replacement in reversed(patch['edits']):
        text = text[:start] + replacement + text[end:]
    path.write_text(text)
    assert digest(path.read_bytes()) == patch['after'], patch['path']

# Only checksum strings were compressed in the transferred lock. Restore them
# from the exact package/version metadata, then verify the ENTIRE original lock.
lock = ROOT / 'pnpm-lock.yaml'
text = lock.read_text()
pattern = re.compile(r"^  ([^\n]+):\n    resolution: \{integrity: __REGISTRY_INTEGRITY__\}", re.MULTILINE)
matches = list(pattern.finditer(text))
assert len(matches) == text.count('__REGISTRY_INTEGRITY__') == 898

def integrity(match):
    key = match.group(1).strip("'\"")
    name, version = key.rsplit('@', 1)
    url = 'https://registry.npmjs.org/' + urllib.parse.quote(name, safe='') + '/' + urllib.parse.quote(version, safe='')
    value = fetch_json(url)['dist']['integrity']
    if not re.fullmatch(r'sha512-[A-Za-z0-9+/=]+', value):
        raise ValueError('Unexpected registry integrity for ' + key)
    return value

with ThreadPoolExecutor(max_workers=12) as pool:
    values = list(pool.map(integrity, matches))
for match, value in reversed(list(zip(matches, values))):
    text = text[:match.start()] + match.group(0).replace('__REGISTRY_INTEGRITY__', value) + text[match.end():]
assert digest(text.encode()) == metadata['lockSha256'], 'Restored lock does not match original release'
lock.write_text(text)
record = ''.join(name + '\0' + digest(path_for(name).read_bytes()) + '\n' for name in metadata['sourcePaths'])
assert digest(record.encode()) == metadata['sourceDigest'], 'Combined source integrity mismatch'
print(json.dumps({'verifiedSourceFiles': len(allowed), 'sourceDigest': metadata['sourceDigest'], 'lockSha256': metadata['lockSha256']}, indent=2))
