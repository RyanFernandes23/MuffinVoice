i am building a tts app, i want to use next js.
i have a homepage where  i have a navbar, the navbar contains, pricing, home, dashboard, login, singnup.
we have big text at the center of the screen saying muffin TTS.
below this big text we have a button called go to dashbaord.

-- dashboadrd page,
in dashboard we have a search notebook panel where we can search notebook.
A notebook is a file where when you open it wll have the file uploaded by the user and the audioplayer to play it as our tts takes in a user uploaded document and processes speech for that document.
the speech is streamed to the user with HLS like system.
when a user uplods a file to endpoint. that is localhost/8000/upload files,
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Header(..., alias="X-User-ID"),
    voice: str = Header("af_bella", alias="voice")  # Default voice is af_bella if not provided
):
response:    return {
        "message": "File uploaded. processing speech.",
        "voice": voice,
        "job_id": job_id
    }

we create a notebook for the file being uploaded which also shows the job statsus for the job_id of that notebook whether it is processing or not, if t completed then we can open the audio player withing that notebook.  this audio player can be opened only when status is completed. to monitor the stauts we have antohter endpoint called 

@app.get("/job_status/{job_id}")
async def job_status(job_id: str):
    data = get_job_status(job_id)
    if not data:
        logger.warning(f"Job ID {job_id} not found.")
        raise HTTPException(status_code=404, detail="Job ID not found.")
    return data

at local host8000
for the notebook we have 3 dot icon that shows two options  open and delete, when clicked on this icon and then clicked somewhere else on the screen we close this three dot icon.
for processing stauts we have to make a spinner  to spin on the notebook. once the status completed notebook should be able to open otherwise disabled from opening, if user clicks while processing  so a toast that the files is being processed.

we need  an audio player or mp3 player ui with hls suppport to get the manifest file and play the audio for that particular notebookd, seek forward and backward options by five seconds. the preloading ui like youtube where the white line is ahead of the red line when played, sound control, speed, good animations.

we should use prebuilt uis if available. i like black and white theme, white not full bright because it will hit our eyes so a little bit dim.

the manifest url si this from where we can get .m3u8 file for that particular voice in the job_id.
@app.get("/stream/{user_id}/{job_id}/{voice}/manifest.m3u8")
async def serve_manifest(user_id: str, job_id: str, voice: str):
 return Response(content, media_type="application/vnd.apple.mpegurl")
 again in localhost only.


look for edge cases implement step by step.

the ui must be aesthetic black and gray theme, cool animations. for buttons, and other ui elements.
prevent bugs in the ui.

do not keep dummy notebooks, while uploading show the document picked a little bigger as it is not visible, the size of the document shows zero mb  show kb also, if its is less than zero mb
