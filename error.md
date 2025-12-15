## Error Type
Build Error

## Error Message
Parsing ecmascript source code failed

## Build Output
./app/components/UploadModal.jsx:130:1
Parsing ecmascript source code failed
  128 |     </div>
  129 |   );
> 130 |
      | ^

Expected '</', got '<eof>'

Import traces:
  Client Component Browser:
    ./app/components/UploadModal.jsx [Client Component Browser]
    ./app/dashboard/page.jsx [Client Component Browser]
    ./app/dashboard/page.jsx [Server Component]

  Client Component SSR:
    ./app/components/UploadModal.jsx [Client Component SSR]
    ./app/dashboard/page.jsx [Client Component SSR]
    ./app/dashboard/page.jsx [Server Component]

Next.js version: 16.0.1 (Turbopack)
