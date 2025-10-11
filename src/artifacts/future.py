

# @app.get("/hls/{job_id}/master.m3u8")
# async def get_master_playlist(job_id: str, user_id: str = Depends(get_current_user_id)):
#     # Build EXT-X-MEDIA entries for each voice
#     media_tags = []
#     for i, voice in enumerate(voices):
#         is_default = "YES" if i == 0 else "NO"
#         media_tags.append(
#             f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="{voice}",'
#             f'DEFAULT={is_default},AUTOSELECT={is_default},LANGUAGE="en",'
#             f'URI="audio/{voice}/playlist.m3u8"'
#         )
    
#     playlist = f"""#EXTM3U
# #EXT-X-VERSION:4

# {chr(10).join(media_tags)}

# #EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2",AUDIO="audio"
# stream.m3u8
# """
#     return Response(content=playlist, media_type="application/vnd.apple.mpegurl")



# @app.get("/live_tts/{job_id}/{chunk_index}.mp3")
# async def get_tts_chunk(
#     job_id: str,
#     chunk_index: int,
#     voice: str = "af_bella",
#     user_id: str = Depends(get_current_user_id)
# ):
#     # Check if audio already exists in S3
#     s3_audio_key = f"{user_id}/{job_id}/audio/{voice}/{chunk_index}.mp3"
    
#     try:
#         # Try to retrieve cached audio
#         s3_object = s3.get_object(Bucket=S3_BUCKET_NAME, Key=s3_audio_key)
#         audio_data = s3_object['Body'].read()
#         return Response(content=audio_data, media_type="audio/mpeg")
#     except ClientError as e:
#         if e.response['Error']['Code'] != 'NoSuchKey':
#             raise HTTPException(status_code=500, detail="Storage error")
    
#     # Audio doesn't exist, generate it
#     s3_key = f"{user_id}/{job_id}/chunks.json"
#     s3_object = s3.get_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
#     text_chunks = json.loads(s3_object['Body'].read())
    
#     if not 0 <= chunk_index < len(text_chunks):
#         raise HTTPException(status_code=400, detail="Invalid chunk index")
    
#     # Generate and cache
#     audio_data = tts_generator(text_chunks[chunk_index], voice)
    
#     # Store for future requests
#     s3.put_object(
#         Bucket=S3_BUCKET_NAME,
#         Key=s3_audio_key,
#         Body=audio_data
#     )
    
#     return Response(content=audio_data, media_type="audio/mpeg")

# @app.get("/hls/{job_id}/audio/{voice}/playlist.m3u8")
# async def get_voice_playlist(
#     job_id: str,
#     voice: str,
#     user_id: str = Depends(get_current_user_id)
# ):
#     # Get chunk count
#     s3_object = s3.get_object(Bucket=S3_BUCKET_NAME, Key=f"{user_id}/{job_id}/chunks.json")
#     text_chunks = json.loads(s3_object['Body'].read())
    
#     # Generate media playlist for this voice
#     playlist = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n"
    
#     for i in range(len(text_chunks)):
#         playlist += f"#EXTINF:10.0,\n"
#         playlist += f"/live_tts/{job_id}/{i}.mp3?voice={voice}\n"
    
#     playlist += "#EXT-X-ENDLIST\n"
    
#     return Response(content=playlist, media_type="application/vnd.apple.mpegurl")