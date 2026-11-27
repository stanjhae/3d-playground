#!/usr/bin/env python3
"""Seat a downloaded Sketchfab GLB in the studio frame and stamp house extras."""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path


TARGET_HEIGHT = 1.65


def read_glb(*, path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, _length = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF' or version != 2:
        raise SystemExit(f'Not a GLB: {path}')

    chunk_len, chunk_type = struct.unpack_from('<I4s', data, 12)
    if chunk_type != b'JSON':
        raise SystemExit('GLB JSON chunk missing')

    document = json.loads(data[20 : 20 + chunk_len])
    return document, data[20 + chunk_len :]


def write_glb(*, path: Path, document: dict, bin_chunk: bytes) -> None:
    json_bytes = json.dumps(document, separators=(',', ':')).encode('utf-8')
    pad = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b' ' * pad
    total = 12 + 8 + len(json_bytes) + len(bin_chunk)
    out = bytearray()
    out += struct.pack('<4sII', b'glTF', 2, total)
    out += struct.pack('<I4s', len(json_bytes), b'JSON')
    out += json_bytes
    out += bin_chunk
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(out)


def parse_map(*, raw: str) -> dict[str, str]:
    mapping: dict[str, str] = {}
    if not raw:
        return mapping
    for pair in raw.split(','):
        if '=' not in pair:
            continue
        source, dest = pair.split('=', 1)
        mapping[source.strip().lower()] = dest.strip()
    return mapping


def material_index(*, document: dict, node: dict) -> int | None:
    mesh_index = node.get('mesh')
    if not isinstance(mesh_index, int):
        return None
    meshes = document.get('meshes') or []
    if mesh_index >= len(meshes):
        return None
    primitives = meshes[mesh_index].get('primitives') or []
    if not primitives:
        return None
    material = primitives[0].get('material')
    return material if isinstance(material, int) else None


def mesh_z_center(*, document: dict, node: dict) -> float:
    mesh_index = node.get('mesh')
    if not isinstance(mesh_index, int):
        return 0.0
    meshes = document.get('meshes') or []
    primitives = (meshes[mesh_index].get('primitives') or []) if mesh_index < len(meshes) else []
    accessors = document.get('accessors') or []
    z_values: list[float] = []
    for primitive in primitives:
        attributes = primitive.get('attributes') or {}
        position = attributes.get('POSITION')
        if not isinstance(position, int) or position >= len(accessors):
            continue
        accessor = accessors[position]
        if accessor.get('min') and accessor.get('max'):
            z_values.append((accessor['min'][2] + accessor['max'][2]) / 2)
    if not z_values:
        return 0.0
    return sum(z_values) / len(z_values)


def local_z_bounds(*, document: dict) -> tuple[float, float]:
    z_min = float('inf')
    z_max = float('-inf')
    for accessor in document.get('accessors') or []:
        if accessor.get('type') != 'VEC3' or not accessor.get('min') or not accessor.get('max'):
            continue
        z_min = min(z_min, accessor['min'][2], accessor['max'][2])
        z_max = max(z_max, accessor['min'][2], accessor['max'][2])
    return z_min, z_max


def guess_part(
    *,
    document: dict,
    node: dict,
    mapping: dict[str, str],
    waist: float,
) -> str:
    material = material_index(document=document, node=node)
    material_key = f'mat{material}' if material is not None else ''
    if material_key in mapping:
        mapped = mapping[material_key]
        if mapped == 'split':
            return 'skirt' if mesh_z_center(document=document, node=node) < waist else 'body'
        return mapped

    name = str(node.get('name') or '').lower()
    for needle, part in mapping.items():
        if needle in name:
            return part

    materials = document.get('materials') or []
    material_name = ''
    if material is not None and material < len(materials):
        material_name = str(materials[material].get('name') or '').lower()

    if 'button' in material_name or 'slider' in material_name or 'stopper' in material_name:
        return 'hardware'
    if 'line' in material_name:
        return 'hardware'

    return 'body'


def is_hero_garment(*, path: Path) -> bool:
    resolved = path.expanduser().resolve()
    return resolved.name == 'garment.glb' and resolved.parent.name == 'models'


def ingest_garment(
    *,
    src: Path,
    out: Path,
    author: str,
    title: str,
    license_id: str,
    href: str,
    mapping: dict[str, str],
    waist_ratio: float,
) -> dict:
    if is_hero_garment(path=out):
        raise SystemExit('Refusing to overwrite the seated evening gown')

    document, bin_chunk = read_glb(path=src)
    z_min, z_max = local_z_bounds(document=document)
    height = max(z_max - z_min, 1e-6)
    waist = z_min + height * waist_ratio
    counts: dict[str, int] = {}
    names: list[str] = []

    for node in document.get('nodes') or []:
        if node.get('mesh') is None:
            continue
        part = guess_part(
            document=document,
            node=node,
            mapping=mapping,
            waist=waist,
        )
        counts[part] = counts.get(part, 0) + 1
        node['name'] = part if counts[part] == 1 else f'{part}-{counts[part] - 1}'
        names.append(node['name'])

    if not names:
        raise SystemExit(f'No clothing meshes left in {src}')

    scale = TARGET_HEIGHT / height
    lift = -z_min * scale
    root = (document.get('nodes') or [{}])[0]
    matrix = root.get('matrix') or [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    scaled = [value * scale for value in matrix[:12]] + [0.0, 0.0, 0.0, 1.0]
    scaled[12] = matrix[12] * scale
    scaled[13] = matrix[13] * scale + lift
    scaled[14] = matrix[14] * scale
    root['matrix'] = scaled
    root['name'] = 'body-root'
    root.pop('translation', None)
    root.pop('rotation', None)
    root.pop('scale', None)

    extras = document.get('asset', {}).get('extras') or {}
    document.setdefault('asset', {})
    document['asset']['extras'] = {
        'author': extras.get('author') or author,
        'title': extras.get('title') or title,
        'license': extras.get('license') or license_id,
        'source': extras.get('source') or href,
    }

    write_glb(path=out, document=document, bin_chunk=bin_chunk)
    return {
        'out': str(out),
        'bytes': out.stat().st_size,
        'names': names,
        'parts': sorted(counts),
        'scale': scale,
        'z': [z_min, z_max],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--author', default='Style3D CG')
    parser.add_argument('--title', required=True)
    parser.add_argument('--license', dest='license_id', default='CC-BY-4.0')
    parser.add_argument('--href', default='')
    parser.add_argument('--map', default='')
    parser.add_argument('--waist', type=float, default=0.42)
    args = parser.parse_args()
    result = ingest_garment(
        src=Path(args.src),
        out=Path(args.out),
        author=args.author,
        title=args.title,
        license_id=args.license_id,
        href=args.href,
        mapping=parse_map(raw=args.map),
        waist_ratio=args.waist,
    )
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
