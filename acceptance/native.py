"""Inventory installed native payloads. Ordinary imports and PE fields do not prove OS compatibility."""
import json
import sys
from pathlib import Path

import pefile

root, output = map(Path, sys.argv[1:])
records = []
# Direct imports of these Win32 exports need Windows 11 or a newer server.
# Delayed or dynamically resolved calls can have application fallbacks.
newer = {"GetMachineTypeAttributes", "GetThreadSelectedCpuSetMasks", "SetThreadSelectedCpuSetMasks",
         "GetProcessDefaultCpuSetMasks", "SetProcessDefaultCpuSetMasks"}
for file in root.rglob("*"):
    if file.suffix.lower() not in {".dll", ".exe", ".node", ".pyd"} or not file.is_file():
        continue
    pe = pefile.PE(str(file), fast_load=True)
    try:
        pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"]])
        imports = [i.name.decode("ascii", "replace") for row in getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])
                   if row.dll.lower() in {b"kernel32.dll", b"kernelbase.dll"}
                   or row.dll.lower().startswith(b"api-ms-win-") for i in row.imports if i.name]
        header = pe.OPTIONAL_HEADER
        records.append({"file": file.relative_to(root).as_posix(), "machine": hex(pe.FILE_HEADER.Machine),
                        "subsystemVersion": [header.MajorSubsystemVersion, header.MinorSubsystemVersion],
                        "newerDirectImports": sorted(set(imports) & newer)})
    finally:
        pe.close()
assert any(r["file"] == "DeepSeek Harness.exe" and r["machine"] == "0x8664" for r in records)
assert any(r["file"].endswith(".node") for r in records), "Missing native Node modules"
output.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
suspects = [r for r in records if r["newerDirectImports"] or r["subsystemVersion"][0] > 10]
for row in suspects:
    print("Review minimum OS:", row)
print(f"Indexed {len(records)} native files, {len(suspects)} require further OS review.")
