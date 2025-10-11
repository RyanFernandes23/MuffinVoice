from celery import Celery

celery_app = Celery('tasks', broker='redis://localhost:6379/0', backend='redis://localhost:6379/0')
# Windows-specific settings
celery_app.conf.worker_pool = 'solo'  # Use solo pool instead of prefork
celery_app.conf.broker_connection_retry_on_startup = True


# Define the queues
celery_app.conf.task_queues = {
    'gatekeeper_queue': {'routing_key': 'gatekeeper'},
    'chunk_processing_queue': {'routing_key': 'chunk_processor'},
    'manifest_assembly_queue': {'routing_key': 'manifest_assembler'},
}
# Route tasks to their specific queues
celery_app.conf.task_routes = {
    'tasks.check_existing_manifest_task': {'queue': 'gatekeeper_queue', 'routing_key': 'gatekeeper'},
    'tasks.process_single_chunk_task': {'queue': 'chunk_processing_queue', 'routing_key': 'chunk_processor'},
    'tasks.create_final_manifest_task': {'queue': 'manifest_assembly_queue', 'routing_key': 'manifest_assembler'},
    'workflows.generate_and_save_manifest_workflow': {'queue': 'gatekeeper_queue', 'routing_key': 'gatekeeper'},
    'workflows.process_all_chunks_and_create_manifest': {'queue': 'gatekeeper_queue', 'routing_key': 'gatekeeper'},
}