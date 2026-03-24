/**
 * Storage abstraction.
 *
 * HIPAA note:
 * - In production on AWS, use private S3 buckets + SSE-KMS (ServerSideEncryption: aws:kms)
 * - Restrict access via IAM + VPC endpoints.
 */

export type StoredObject = {
  key: string;
  url?: string; // optional (e.g., presigned or https)
};

export interface AudioStorage {
  putAudio(params: {
    patientId: string;
    contentType: string;
    bytes: Uint8Array;
    ext?: string;
  }): Promise<StoredObject>;
}
