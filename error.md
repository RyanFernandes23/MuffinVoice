 File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1419, in execute
    return meth(
           ^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\sql\elements.py", line 527, in _execute_on_connection
    return connection._execute_clauseelement(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1641, in _execute_clauseelement
    ret = self._execute_context(        
          ^^^^^^^^^^^^^^^^^^^^^^        
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1846, in _execute_context
    return self._exec_single_context(   
           ^^^^^^^^^^^^^^^^^^^^^^^^^^   
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1986, in _exec_single_context
    self._handle_dbapi_exception(       
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 2363, in _handle_dbapi_exception
    raise sqlalchemy_exception.with_traceback(exc_info[2]) from e
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1967, in _exec_single_context
    self.dialect.do_execute(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\default.py", line 952, in do_execute
    cursor.execute(statement, parameters)
sqlalchemy.exc.IntegrityError: (psycopg2.errors.ForeignKeyViolation) insert or update on table "paymentevent" violates foreign key constraint "paymentevent_user_id_fkey"
DETAIL:  Key (user_id)=(system) is not present in table "user".

[SQL: INSERT INTO paymentevent (event_id, user_id, payment_id, subscription_id, event_type, event_description, error_code, error_details, timestamp, is_resolved, resolved_at, resolved_by, created_at, updated_at) VALUES (%(event_id)s::UUID, %(user_id)s, %(payment_id)s, %(subscription_id)s, %(event_type)s, %(event_description)s, %(error_code)s, %(error_details)s::JSON, %(timestamp)s, %(is_resolved)s, %(resolved_at)s, %(resolved_by)s, %(created_at)s, %(updated_at)s)]
[parameters: {'event_id': UUID('f34347c4-e7ed-4c81-a625-935914df5606'), 'user_id': 'system', 'payment_id': None, 'subscription_id': None, 'event_type': 'webhook_critical_error', 'event_description': 'Critical error in webhook processing: 400: Invalid signature', 'error_code': None, 'error_details': 'null', 'timestamp': datetime.datetime(2026, 2, 7, 18, 10, 59, 347161, tzinfo=datetime.timezone.utc), 'is_resolved': False, 'resolved_at': None, 'resolved_by': None, 'created_at': datetime.datetime(2026, 2, 7, 18, 10, 59, 347161, tzinfo=datetime.timezone.utc), 'updated_at': datetime.datetime(2026, 2, 7, 18, 10, 59, 347161, tzinfo=datetime.timezone.utc)}]
(Background on this error at: https://sqlalche.me/e/20/gkpj)
[WEBHOOK] Error: 400: Invalid signature
INFO:     52.66.76.63:0 - "POST /payment/webhook HTTP/1.1" 500 Internal Server Error
ERROR:    Exception in ASGI application 
Traceback (most recent call last):      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\routers\payment.py", line 187, in razorpay_webhook
    raise HTTPException(status_code=400, detail="Invalid signature")
fastapi.exceptions.HTTPException: 400: Invalid signature

During handling of the above exception, another exception occurred:

Traceback (most recent call last):      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1967, in _exec_single_context
    self.dialect.do_execute(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\default.py", line 952, in do_execute
    cursor.execute(statement, parameters)
psycopg2.errors.ForeignKeyViolation: insert or update on table "paymentevent" violates foreign key constraint "paymentevent_user_id_fkey"
DETAIL:  Key (user_id)=(system) is not present in table "user".


The above exception was the direct cause of the following exception:

Traceback (most recent call last):      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\uvicorn\protocols\http\h11_impl.py", line 410, in run_asgi
    result = await app(  # type: ignore[func-returns-value]
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\uvicorn\middleware\proxy_headers.py", line 60, in __call__
    return await self.app(scope, receive, send)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\applications.py", line 1135, in __call__ 
    await super().__call__(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\applications.py", line 107, in __call__
    await self.middleware_stack(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\errors.py", line 186, in __call__
    raise exc
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\errors.py", line 164, in __call__
    await self.app(scope, receive, _send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\cors.py", line 85, in __call__
    await self.app(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\exceptions.py", line 63, in __call__
    await wrap_app_handling_exceptions(self.app, conn)(scope, receive, send)    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)   
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\middleware\asyncexitstack.py", line 18, in __call__
    await self.app(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\routing.py", line 716, in __call__     
    await self.middleware_stack(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\routing.py", line 736, in app
    await route.handle(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\routing.py", line 290, in handle       
    await self.app(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 115, in app
    await wrap_app_handling_exceptions(app, request)(scope, receive, send)      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)   
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 101, in app
    response = await f(request)
               ^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 355, in app
    raw_response = await run_endpoint_function(
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 243, in run_endpoint_function
    return await dependant.call(**values)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\routers\payment.py", line 212, in razorpay_webhook
    db.commit()
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 2030, in commit 
    trans.commit(_to_root=True)
  File "<string>", line 2, in commit    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\state_changes.py", line 137, in _go
    ret_value = fn(self, *arg, **kw)    
                ^^^^^^^^^^^^^^^^^^^^    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 1311, in commit 
    self._prepare_impl()
  File "<string>", line 2, in _prepare_impl
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\state_changes.py", line 137, in _go
    ret_value = fn(self, *arg, **kw)    
                ^^^^^^^^^^^^^^^^^^^^    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 1286, in _prepare_impl
    self.session.flush()
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 4331, in flush  
    self._flush(objects)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 4466, in _flush 
    with util.safe_reraise():
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\util\langhelpers.py", line 224, in __exit__
    raise exc_value.with_traceback(exc_tb)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 4427, in _flush 
    flush_context.execute()
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\unitofwork.py", line 466, in execute
    rec.execute(self)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\unitofwork.py", line 642, in execute
    util.preloaded.orm_persistence.save_obj(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\persistence.py", line 93, in save_obj
    _emit_insert_statements(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\persistence.py", line 1048, in _emit_insert_statements
    result = connection.execute(        
             ^^^^^^^^^^^^^^^^^^^        
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1419, in execute
    return meth(
           ^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\sql\elements.py", line 527, in _execute_on_connection
    return connection._execute_clauseelement(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1641, in _execute_clauseelement
    ret = self._execute_context(        
          ^^^^^^^^^^^^^^^^^^^^^^        
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1846, in _execute_context
    return self._exec_single_context(   
           ^^^^^^^^^^^^^^^^^^^^^^^^^^   
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1986, in _exec_single_context
    self._handle_dbapi_exception(       
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 2363, in _handle_dbapi_exception
    raise sqlalchemy_exception.with_traceback(exc_info[2]) from e
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1967, in _exec_single_context
    self.dialect.do_execute(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\default.py", line 952, in do_execute
    cursor.execute(statement, parameters)
sqlalchemy.exc.IntegrityError: (psycopg2.errors.ForeignKeyViolation) insert or update on table "paymentevent" violates foreign key constraint "paymentevent_user_id_fkey"
DETAIL:  Key (user_id)=(system) is not present in table "user".

[SQL: INSERT INTO paymentevent (event_id, user_id, payment_id, subscription_id, event_type, event_description, error_code, error_details, timestamp, is_resolved, resolved_at, resolved_by, created_at, updated_at) VALUES (%(event_id)s::UUID, %(user_id)s, %(payment_id)s, %(subscription_id)s, %(event_type)s, %(event_description)s, %(error_code)s, %(error_details)s::JSON, %(timestamp)s, %(is_resolved)s, %(resolved_at)s, %(resolved_by)s, %(created_at)s, %(updated_at)s)]
[parameters: {'event_id': UUID('da88052a-b8a1-4be4-a536-52a9475d9bf4'), 'user_id': 'system', 'payment_id': None, 'subscription_id': None, 'event_type': 'webhook_critical_error', 'event_description': 'Critical error in webhook processing: 400: Invalid signature', 'error_code': None, 'error_details': 'null', 'timestamp': datetime.datetime(2026, 2, 7, 18, 11, 4, 585243, tzinfo=datetime.timezone.utc), 'is_resolved': False, 'resolved_at': None, 'resolved_by': None, 'created_at': datetime.datetime(2026, 2, 7, 18, 11, 4, 585243, tzinfo=datetime.timezone.utc), 'updated_at': datetime.datetime(2026, 2, 7, 18, 11, 4, 585243, tzinfo=datetime.timezone.utc)}]
(Background on this error at: https://sqlalche.me/e/20/gkpj)
[WEBHOOK] Error: 400: Invalid signature
INFO:     52.66.75.174:0 - "POST /payment/webhook HTTP/1.1" 500 Internal Server Error
ERROR:    Exception in ASGI application 
Traceback (most recent call last):      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\routers\payment.py", line 187, in razorpay_webhook
    raise HTTPException(status_code=400, detail="Invalid signature")
fastapi.exceptions.HTTPException: 400: Invalid signature

During handling of the above exception, another exception occurred:

Traceback (most recent call last):      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1967, in _exec_single_context
    self.dialect.do_execute(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\default.py", line 952, in do_execute
    cursor.execute(statement, parameters)
psycopg2.errors.ForeignKeyViolation: insert or update on table "paymentevent" violates foreign key constraint "paymentevent_user_id_fkey"
DETAIL:  Key (user_id)=(system) is not present in table "user".


The above exception was the direct cause of the following exception:

Traceback (most recent call last):      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\uvicorn\protocols\http\h11_impl.py", line 410, in run_asgi
    result = await app(  # type: ignore[func-returns-value]
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\uvicorn\middleware\proxy_headers.py", line 60, in __call__
    return await self.app(scope, receive, send)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\applications.py", line 1135, in __call__ 
    await super().__call__(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\applications.py", line 107, in __call__
    await self.middleware_stack(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\errors.py", line 186, in __call__
    raise exc
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\errors.py", line 164, in __call__
    await self.app(scope, receive, _send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\cors.py", line 85, in __call__
    await self.app(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\exceptions.py", line 63, in __call__
    await wrap_app_handling_exceptions(self.app, conn)(scope, receive, send)    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)   
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\middleware\asyncexitstack.py", line 18, in __call__
    await self.app(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\routing.py", line 716, in __call__     
    await self.middleware_stack(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\routing.py", line 736, in app
    await route.handle(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\routing.py", line 290, in handle       
    await self.app(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 115, in app
    await wrap_app_handling_exceptions(app, request)(scope, receive, send)      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)   
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 101, in app
    response = await f(request)
               ^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 355, in app
    raw_response = await run_endpoint_function(
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 243, in run_endpoint_function
    return await dependant.call(**values)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\routers\payment.py", line 212, in razorpay_webhook
    db.commit()
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 2030, in commit 
    trans.commit(_to_root=True)
  File "<string>", line 2, in commit    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\state_changes.py", line 137, in _go
    ret_value = fn(self, *arg, **kw)    
                ^^^^^^^^^^^^^^^^^^^^    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 1311, in commit 
    self._prepare_impl()
  File "<string>", line 2, in _prepare_impl
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\state_changes.py", line 137, in _go
    ret_value = fn(self, *arg, **kw)    
                ^^^^^^^^^^^^^^^^^^^^    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 1286, in _prepare_impl
    self.session.flush()
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 4331, in flush  
    self._flush(objects)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 4466, in _flush 
    with util.safe_reraise():
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\util\langhelpers.py", line 224, in __exit__
    raise exc_value.with_traceback(exc_tb)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 4427, in _flush 
    flush_context.execute()
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\unitofwork.py", line 466, in execute
    rec.execute(self)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\unitofwork.py", line 642, in execute
    util.preloaded.orm_persistence.save_obj(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\persistence.py", line 93, in save_obj
    _emit_insert_statements(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\persistence.py", line 1048, in _emit_insert_statements
    result = connection.execute(        
             ^^^^^^^^^^^^^^^^^^^        
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1419, in execute
    return meth(
           ^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\sql\elements.py", line 527, in _execute_on_connection
    return connection._execute_clauseelement(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1641, in _execute_clauseelement
    ret = self._execute_context(        
          ^^^^^^^^^^^^^^^^^^^^^^        
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1846, in _execute_context
    return self._exec_single_context(   
           ^^^^^^^^^^^^^^^^^^^^^^^^^^   
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1986, in _exec_single_context
    self._handle_dbapi_exception(       
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 2363, in _handle_dbapi_exception
    raise sqlalchemy_exception.with_traceback(exc_info[2]) from e
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1967, in _exec_single_context
    self.dialect.do_execute(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\default.py", line 952, in do_execute
    cursor.execute(statement, parameters)
sqlalchemy.exc.IntegrityError: (psycopg2.errors.ForeignKeyViolation) insert or update on table "paymentevent" violates foreign key constraint "paymentevent_user_id_fkey"
DETAIL:  Key (user_id)=(system) is not present in table "user".

[SQL: INSERT INTO paymentevent (event_id, user_id, payment_id, subscription_id, event_type, event_description, error_code, error_details, timestamp, is_resolved, resolved_at, resolved_by, created_at, updated_at) VALUES (%(event_id)s::UUID, %(user_id)s, %(payment_id)s, %(subscription_id)s, %(event_type)s, %(event_description)s, %(error_code)s, %(error_details)s::JSON, %(timestamp)s, %(is_resolved)s, %(resolved_at)s, %(resolved_by)s, %(created_at)s, %(updated_at)s)]
[parameters: {'event_id': UUID('50d89390-8b2d-4306-a33c-8dadc9b3f7de'), 'user_id': 'system', 'payment_id': None, 'subscription_id': None, 'event_type': 'webhook_critical_error', 'event_description': 'Critical error in webhook processing: 400: Invalid signature', 'error_code': None, 'error_details': 'null', 'timestamp': datetime.datetime(2026, 2, 7, 18, 11, 4, 611674, tzinfo=datetime.timezone.utc), 'is_resolved': False, 'resolved_at': None, 'resolved_by': None, 'created_at': datetime.datetime(2026, 2, 7, 18, 11, 4, 611674, tzinfo=datetime.timezone.utc), 'updated_at': datetime.datetime(2026, 2, 7, 18, 11, 4, 611674, tzinfo=datetime.timezone.utc)}]
(Background on this error at: https://sqlalche.me/e/20/gkpj)
[WEBHOOK] Error: 400: Invalid signature 
INFO:     52.66.76.63:0 - "POST /payment/webhook HTTP/1.1" 500 Internal Server Error
ERROR:    Exception in ASGI application 
Traceback (most recent call last):      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\routers\payment.py", line 187, in razorpay_webhook
    raise HTTPException(status_code=400, detail="Invalid signature")
fastapi.exceptions.HTTPException: 400: Invalid signature

During handling of the above exception, another exception occurred:

Traceback (most recent call last):      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1967, in _exec_single_context
    self.dialect.do_execute(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\default.py", line 952, in do_execute
    cursor.execute(statement, parameters)
psycopg2.errors.ForeignKeyViolation: insert or update on table "paymentevent" violates foreign key constraint "paymentevent_user_id_fkey"
DETAIL:  Key (user_id)=(system) is not present in table "user".


The above exception was the direct cause of the following exception:

Traceback (most recent call last):      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\uvicorn\protocols\http\h11_impl.py", line 410, in run_asgi
    result = await app(  # type: ignore[func-returns-value]
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\uvicorn\middleware\proxy_headers.py", line 60, in __call__
    return await self.app(scope, receive, send)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\applications.py", line 1135, in __call__ 
    await super().__call__(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\applications.py", line 107, in __call__
    await self.middleware_stack(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\errors.py", line 186, in __call__
    raise exc
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\errors.py", line 164, in __call__
    await self.app(scope, receive, _send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\cors.py", line 85, in __call__
    await self.app(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\middleware\exceptions.py", line 63, in __call__
    await wrap_app_handling_exceptions(self.app, conn)(scope, receive, send)    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)   
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\middleware\asyncexitstack.py", line 18, in __call__
    await self.app(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\routing.py", line 716, in __call__     
    await self.middleware_stack(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\routing.py", line 736, in app
    await route.handle(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\routing.py", line 290, in handle       
    await self.app(scope, receive, send)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 115, in app
    await wrap_app_handling_exceptions(app, request)(scope, receive, send)      
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)   
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 101, in app
    response = await f(request)
               ^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 355, in app
    raw_response = await run_endpoint_function(
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\fastapi\routing.py", line 243, in run_endpoint_function
    return await dependant.call(**values)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\src\api\routers\payment.py", line 212, in razorpay_webhook
    db.commit()
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 2030, in commit 
    trans.commit(_to_root=True)
  File "<string>", line 2, in commit    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\state_changes.py", line 137, in _go
    ret_value = fn(self, *arg, **kw)    
                ^^^^^^^^^^^^^^^^^^^^    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 1311, in commit 
    self._prepare_impl()
  File "<string>", line 2, in _prepare_impl
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\state_changes.py", line 137, in _go
    ret_value = fn(self, *arg, **kw)    
                ^^^^^^^^^^^^^^^^^^^^    
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 1286, in _prepare_impl
    self.session.flush()
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 4331, in flush  
    self._flush(objects)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 4466, in _flush 
    with util.safe_reraise():
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\util\langhelpers.py", line 224, in __exit__
    raise exc_value.with_traceback(exc_tb)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\session.py", line 4427, in _flush 
    flush_context.execute()
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\unitofwork.py", line 466, in execute
    rec.execute(self)
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\unitofwork.py", line 642, in execute
    util.preloaded.orm_persistence.save_obj(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\persistence.py", line 93, in save_obj
    _emit_insert_statements(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\orm\persistence.py", line 1048, in _emit_insert_statements
    result = connection.execute(        
             ^^^^^^^^^^^^^^^^^^^        
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1419, in execute
    return meth(
           ^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\sql\elements.py", line 527, in _execute_on_connection
    return connection._execute_clauseelement(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1641, in _execute_clauseelement
    ret = self._execute_context(        
          ^^^^^^^^^^^^^^^^^^^^^^        
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1846, in _execute_context
    return self._exec_single_context(   
           ^^^^^^^^^^^^^^^^^^^^^^^^^^   
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1986, in _exec_single_context
    self._handle_dbapi_exception(       
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 2363, in _handle_dbapi_exception
    raise sqlalchemy_exception.with_traceback(exc_info[2]) from e
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1967, in _exec_single_context
    self.dialect.do_execute(
  File "C:\Users\Hp\OneDrive\Desktop\WikiVoice\.venv\Lib\site-packages\sqlalchemy\engine\default.py", line 952, in do_execute
    cursor.execute(statement, parameters)
sqlalchemy.exc.IntegrityError: (psycopg2.errors.ForeignKeyViolation) insert or update on table "paymentevent" violates foreign key constraint "paymentevent_user_id_fkey"
DETAIL:  Key (user_id)=(system) is not present in table "user".

[SQL: INSERT INTO paymentevent (event_id, user_id, payment_id, s[parameters: {'event_id': UUID('1f9c9237-ce43-44aa-93e6-c263cec507e6'), 'user_id': 'system', 'payment_id': None, 'subscription_id': None, 'event_type': 'webhook_critical_error', 'event_description': 'Critical error in webhook processing: 400: Invalid signature', 'error_code': None, 'error_details': 'null', 'timestamp': datetime.datetime(2026, 2, 7, 18, 11, 4, 624614, tzinfo=datetime.timezone.utc), 'is_resolved': False, 'resolved_at': None, 'resolved_by': None, 'created_at': datetime.datetime(2026, 2, 7, 18, 11, 4, 624614, tzinfo=datetime.timezone.utc), 'updated_at': datetime.datetime(2026, 2, 7, 18, 11, 4, 624614, tzinfo=datetime.timezone.utc)}]
(Background on this error at: https://sqlalche.me/e/20/gkpj)    







