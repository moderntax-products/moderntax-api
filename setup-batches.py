import json
import csv
import os
from datetime import datetime

print("Creating batch files from centerstone_all_historical.csv...\n")

# Read the CSV
with open('centerstone_all_historical.csv', 'r') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f"Read {len(rows)} rows")

# Create batch directory
os.makedirs('supabase_import_batches', exist_ok=True)

# Map and batch
records = []
for row in rows:
    record = {
        "legal_name": row.get('legal_name') or None,
        "tid": row.get('tid') or None,
        "tid_kind": row.get('tid_kind') or None,
        "address": row.get('address') or None,
        "city": row.get('city') or None,
        "state": row.get('state') or None,
        "zip_code": row.get('zip_code') or None,
        "signer_first_name": row.get('first name') or None,
        "signer_last_name": row.get('last name') or None,
        "signer_email": None,
        "tax_years": row.get('years') or None,
        "tax_forms": row.get('form') or None,
        "credit_application_id": row.get('credit_application_id') or None,
        "status": "historical_import",
        "source": "centerstone_drive_folder",
        "created_at": row.get('signature_created_at') or datetime.now().isoformat()
    }
    records.append(record)

# Create batches
for i in range(0, len(records), 50):
    batch = records[i:i+50]
    batch_num = i // 50 + 1
    with open(f'supabase_import_batches/batch_{batch_num}.json', 'w') as f:
        json.dump(batch, f)
    print(f"✓ batch_{batch_num}.json ({len(batch)} rows)")

print(f"\n✓ Created {(len(records) + 49) // 50} batch files")
