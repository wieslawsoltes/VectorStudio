"""Retrieve the attributed CDR regression fixture; reject changed source bytes."""
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile
from io import BytesIO
from hashlib import sha256
root = Path(__file__).resolve().parents[1]
target = root / 'tests/fixtures/cc0-graveyard-tile.cdr'
expected = 'dc467d4db4244de1005b02a59551ec59e061992bc5b968572bde2acd6c047cb3'
if not target.is_file() or sha256(target.read_bytes()).hexdigest() != expected:
    with urlopen('https://opengameart.org/sites/default/files/GraveyardTileset.zip', timeout=90) as response:
        with ZipFile(BytesIO(response.read())) as archive:
            candidates = [n for n in archive.namelist() if n.lower().endswith('vector/tile.cdr')]
            if len(candidates) != 1:
                raise SystemExit('Expected one CDR regression fixture')
            data = archive.read(candidates[0])
    if sha256(data).hexdigest() != expected:
        raise SystemExit('CDR fixture hash mismatch')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
print('CDR regression fixture verified:', expected)
