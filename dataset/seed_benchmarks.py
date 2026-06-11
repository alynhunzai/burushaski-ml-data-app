import os
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

# Enforce strict credential confirmation
if not os.path.exists("serviceAccountKey.json"):
    raise FileNotFoundError("Please ensure your private key file is named 'serviceAccountKey.json' in this folder.")

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# --- Configurable ML Corpus Threshold Filters ---
MIN_WORDS = 5
MAX_WORDS = 15
MAX_PROMPTS_PER_SOURCE = 1500  # Safe cap to optimize performance and prevent free tier exhaustion

def is_valid_length(text):
    word_count = len(text.strip().split())
    return MIN_WORDS <= word_count <= MAX_WORDS

def seed_large_scale_corpus(file_path, dataset_source):
    """
    Reads a line-by-line file of English sentences, filters them by length, 
    and streams a designated capped subset safely to Firestore using batch writes.
    """
    if not os.path.exists(file_path):
        print(f"⚠️ {file_path} not found. Skipping {dataset_source} upload pipeline.")
        return

    collection_path = "artifacts/burushaski-translation-hub/public/data/benchmark_sentences"
    collection_ref = db.collection(collection_path)
    
    print(f"📝 Parsing source file stream from {file_path} for collection: [{dataset_source}]...")
    
    write_count = 0
    total_lines_scanned = 0
    batch = db.batch()

    with open(file_path, "r", encoding="utf-8") as f:
        for index, raw_line in enumerate(f):
            clean_text = raw_line.strip()
            if not clean_text:
                continue
                
            total_lines_scanned += 1
            
            # Enforce the word count constraint
            if is_valid_length(clean_text):
                # Format unique baseline document identifiers
                doc_id = f"{dataset_source.upper()}_{1000 + write_count}"
                doc_ref = collection_ref.document(doc_id)
                
                batch.set(doc_ref, {
                    "source": dataset_source,
                    "sentenceId": doc_id,
                    "text": clean_text
                })
                write_count += 1
                
                # Firestore batch execution block boundary is 500 operations
                if write_count % 500 == 0:
                    batch.commit()
                    batch = db.batch()
                    print(f"  ⚡ Synchronized batch milestone... ({write_count} records committed)")
            
            # STOP immediately once we hit our designated target cap
            if write_count >= MAX_PROMPTS_PER_SOURCE:
                print(f"  🛑 Target cap of {MAX_PROMPTS_PER_SOURCE} matched. Halting file scanning loop.")
                break

    # Commit any remaining items left in the final batch buffer
    if write_count % 500 != 0:
        batch.commit()

    print(f"🎉 Completed [{dataset_source}]. Injected {write_count} curated items out of {total_lines_scanned} scanned.\n")

if __name__ == "__main__":
    # This will process both files cleanly without choking on the 2+ million rows
    seed_large_scale_corpus("tatoeba_source.txt", "tatoeba")
    seed_large_scale_corpus("flores_source.txt", "flores")
