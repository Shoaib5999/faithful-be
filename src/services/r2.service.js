const path = require('path');
const { randomUUID } = require('crypto');
const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { UPLOAD_FOLDERS } = require('../constants/upload.constants');

let client;

const getClient = () => {
    if (client) return client;

    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
        const err = new Error('R2 storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
        err.statusCode = 500;
        throw err;
    }

    client = new S3Client({
        region: process.env.R2_REGION || 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
    });

    return client;
};

const getBucket = () => {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) {
        const err = new Error('R2_BUCKET_NAME is not configured');
        err.statusCode = 500;
        throw err;
    }
    return bucket;
};

const getPublicBaseUrl = () => {
    const base = process.env.R2_PUBLIC_URL;
    if (!base) {
        const err = new Error('R2_PUBLIC_URL is not configured');
        err.statusCode = 500;
        throw err;
    }
    return base.replace(/\/$/, '');
};

const buildObjectKey = (folderKey, originalName) => {
    const folder = UPLOAD_FOLDERS[folderKey] || UPLOAD_FOLDERS.general;
    const ext = path.extname(originalName || '').toLowerCase() || '.jpg';
    const base = path
        .basename(originalName || 'file', ext)
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .slice(0, 60) || 'file';

    return `${folder}/${Date.now()}-${randomUUID().slice(0, 8)}-${base}${ext}`;
};

const getPublicUrl = (key) => `${getPublicBaseUrl()}/${key}`;

const uploadFromMulterFile = async (file, folderKey) => {
    if (!file?.buffer) {
        const err = new Error('Upload buffer missing');
        err.statusCode = 400;
        throw err;
    }

    const key = buildObjectKey(folderKey, file.originalname);

    await getClient().send(
        new PutObjectCommand({
            Bucket: getBucket(),
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            CacheControl: 'public, max-age=31536000, immutable',
        }),
    );

    return {
        key,
        url: getPublicUrl(key),
    };
};

const deleteObject = async (key) => {
    if (!key) return { deleted: null, result: 'not_found' };

    await getClient().send(
        new DeleteObjectCommand({
            Bucket: getBucket(),
            Key: key,
        }),
    );

    return { deleted: key, result: 'ok' };
};

const deleteMultipleObjects = async (keys) => {
    if (!keys?.length) return { deleted: [] };

    const results = await Promise.all(keys.map((key) => deleteObject(key)));
    return {
        deleted: results.map((r) => r.deleted).filter(Boolean),
    };
};

const listFolderObjects = async (folderPrefix, { maxResults = 30, continuationToken } = {}) => {
    const prefix = folderPrefix.endsWith('/') ? folderPrefix : `${folderPrefix}/`;

    const response = await getClient().send(
        new ListObjectsV2Command({
            Bucket: getBucket(),
            Prefix: prefix,
            MaxKeys: maxResults,
            ContinuationToken: continuationToken,
        }),
    );

    const resources = (response.Contents || []).map((item) => ({
        publicId: item.Key,
        url: getPublicUrl(item.Key),
        bytes: item.Size,
        createdAt: item.LastModified,
    }));

    return {
        resources,
        nextCursor: response.IsTruncated ? response.NextContinuationToken : null,
    };
};

const isConfigured = () =>
    Boolean(
        process.env.R2_ENDPOINT &&
            process.env.R2_ACCESS_KEY_ID &&
            process.env.R2_SECRET_ACCESS_KEY &&
            process.env.R2_BUCKET_NAME &&
            process.env.R2_PUBLIC_URL,
    );

module.exports = {
    uploadFromMulterFile,
    deleteObject,
    deleteMultipleObjects,
    listFolderObjects,
    getPublicUrl,
    isConfigured,
};
