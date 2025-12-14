I have updated the codebase to allow for flexible S3 configuration.
The S3 client is now configured using environment variables.

You will need to create a '.env' file in the root of the project with the following variables:

S3_ENDPOINT_URL=<your_s3_endpoint_url>
S3_ACCESS_KEY_ID=<your_s3_access_key>
S3_SECRET_ACCESS_KEY=<your_s3_secret_key>
S3_REGION_NAME=<your_s3_region>

For example, if you are using AWS S3, your '.env' file might look like this:

S3_ENDPOINT_URL=https://s3.us-west-2.amazonaws.com
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_REGION_NAME=us-west-2