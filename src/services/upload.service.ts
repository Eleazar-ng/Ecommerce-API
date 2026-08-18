import { cloudinary } from '../config/cloudinary.js';
import { env } from '../config/env.js';

const PRODUCT_IMAGE_FOLDER = 'products';
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp';

interface UploadSignatureResult {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  allowedFormats: string;
}

// Generates a short-lived signature authorizing a DIRECT client-to-Cloudinary upload — no
// file ever touches this server. See docs/deferred-decisions.md (Stage 7 scoping
// discussion) for the full architecture reasoning: this keeps the server free of upload
// bandwidth/memory pressure while still requiring an authenticated, permissioned admin
// request to obtain a valid signature in the first place (vs. fully unsigned/public uploads).
//
// IMPORTANT: every param included in paramsToSign below MUST be sent by the client to
// Cloudinary's upload API exactly as-is, or Cloudinary's own signature check will reject
// the upload. `folder` and `allowed_formats` aren't just hints returned for convenience —
// they're cryptographically part of what's being authorized. A client can't silently
// upload to a different folder or a disallowed format using this signature.
export function generateProductImageUploadSignature(): UploadSignatureResult {
  const timestamp = Math.round(Date.now() / 1000);

  const paramsToSign = {
    timestamp,
    folder: PRODUCT_IMAGE_FOLDER,
    allowed_formats: ALLOWED_FORMATS,
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, env.CLOUDINARY_API_SECRET);

  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    folder: PRODUCT_IMAGE_FOLDER,
    allowedFormats: ALLOWED_FORMATS,
  };
}