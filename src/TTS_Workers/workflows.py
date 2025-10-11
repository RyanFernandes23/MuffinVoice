from celery import chain, group, chunks
from src.TTS_Workers.tasks import check_existing_manifest_task, process_single_chunk_task, create_final_manifest_task, celery_app, get_s3_client
import os
import json

# Configuration - adjust these based on your system capacity
BATCH_SIZE = 5  
MAX_CONCURRENT_BATCHES = 2

@celery_app.task
def generate_and_save_manifest_workflow(user_id, job_id, voice):
    """
    This is the main workflow that replaces your original single task.
    """
    s3_prefix = f"{user_id}/{job_id}"
    check_task = check_existing_manifest_task.s(user_id, job_id, voice)
    workflow = check_task | process_all_chunks_and_create_manifest.s(s3_prefix)
    return workflow.apply_async()

@celery_app.task
def process_all_chunks_and_create_manifest(check_result, s3_prefix):
    if isinstance(check_result, str):
        return check_result

    user_id = check_result['user_id']
    job_id = check_result['job_id']
    voice = check_result['voice']

    # Fetch the chunks.json file from S3
    s3 = get_s3_client()
    chunks_response = s3.get_object(Bucket=os.getenv("S3_BUCKET_NAME"), Key=f"{s3_prefix}/chunks.json")
    all_text_chunks = json.loads(chunks_response['Body'].read())

    # Create batches of chunks
    batches = create_batches(all_text_chunks, BATCH_SIZE, s3_prefix, voice)
    
    # Process batches with limited concurrency
    process_batches_with_limits(batches, user_id, job_id, voice, s3_prefix)

def create_batches(all_text_chunks, batch_size, s3_prefix, voice):
    """Split all chunks into manageable batches"""
    batches = []
    for i in range(0, len(all_text_chunks), batch_size):
        batch_chunks = all_text_chunks[i:i + batch_size]
        
        batch_data = {
            "chunks": [
                {
                    "text": chunk_text,
                    "index": i + j,  # Global index
                    "s3_prefix": s3_prefix,
                    "voice": voice
                }
                for j, chunk_text in enumerate(batch_chunks)
            ],
            "batch_id": f"batch_{i//batch_size}",
            "total_batches": (len(all_text_chunks) + batch_size - 1) // batch_size
        }
        batches.append(batch_data)
    
    return batches

def process_batches_with_limits(batches, user_id, job_id, voice, s3_prefix):
    """Process batches with controlled concurrency"""
    from celery import chord
    
    # Create batch processing tasks
    batch_tasks = []
    for batch in batches:
        batch_task = process_batch_of_chunks.s(batch)
        batch_tasks.append(batch_task)
    
    # Use chunks to limit concurrent execution
    # This ensures only MAX_CONCURRENT_BATCHES run at once
    concurrent_batches = chunks(batch_tasks, MAX_CONCURRENT_BATCHES)
    
    # Chain batch processing to final manifest creation
    workflow = concurrent_batches | create_final_manifest_from_batches.s(user_id, job_id, voice, s3_prefix)
    return workflow.apply_async()

@celery_app.task
def process_batch_of_chunks(batch_data):
    """Process a single batch of chunks"""
    batch_results = []
    
    for chunk_data in batch_data["chunks"]:
        try:
            # Reuse your existing single chunk processing logic
            result = process_single_chunk_task(chunk_data)
            batch_results.append(result)
        except Exception as e:
            # Log the error but continue with other chunks in this batch
            print(f"Error processing chunk {chunk_data['index']} in batch {batch_data['batch_id']}: {e}")
            batch_results.append({
                "index": chunk_data["index"],
                "status": "failed",
                "error": str(e)
            })
    
    return {
        "batch_id": batch_data["batch_id"],
        "results": batch_results
    }

@celery_app.task
def create_final_manifest_from_batches(batch_results, user_id, job_id, voice, s3_prefix):
    """Combine results from all batches and create final manifest"""
    # Flatten all results from all batches
    all_chunk_results = []
    for batch_result in batch_results:
        all_chunk_results.extend(batch_result["results"])
    
    # Filter successful chunks
    successful_chunks = [result for result in all_chunk_results if result.get("status") == "success"]
    
    if not successful_chunks:
        raise ValueError("All chunks failed - cannot create manifest")
    
    # Sort by index and calculate timing (your existing logic)
    sorted_chunks = sorted(successful_chunks, key=lambda x: x['index'])
    
    total_duration = sum(item['duration'] for item in sorted_chunks)
    current_start_time = 0.0
    for item in sorted_chunks:
        item['start_time'] = round(current_start_time, 2)
        current_start_time += item['duration']

    # Create and upload final manifest (your existing logic)
    final_manifest = {
        "job_id": job_id,
        "voice": voice,
        "total_duration": round(total_duration, 2),
        "chunks": sorted_chunks
    }

    s3 = get_s3_client()
    manifest_key = f"{s3_prefix}/manifests/{voice}.json"
    s3.put_object(
        Bucket=os.getenv("S3_BUCKET_NAME"), Key=manifest_key,
        Body=json.dumps(final_manifest, ensure_ascii=False).encode('utf-8'),
        ContentType="application/json"
    )
    
    return f"Successfully completed job {job_id} for voice {voice} with {len(successful_chunks)} chunks."