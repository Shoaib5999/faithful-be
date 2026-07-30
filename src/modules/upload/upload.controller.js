const uploadService = require('./upload.service');
const { success, error } = require('../../utils/response');

const uploadSingle = async (req, res, next) => {
    try {
        const file = req.file
            ?? req.files?.image?.[0]
            ?? (Array.isArray(req.files) ? req.files[0] : null);

        if (!file) {
            return error(res, 'No file uploaded', 400);
        }

        return success(
            res,
            {
                url: file.path,
                publicId: file.filename,
                storageKey: file.storageKey || file.filename,
                originalName: file.originalname,
                size: file.size,
                mimetype: file.mimetype,
            },
            'File uploaded successfully',
            201,
        );
    } catch (err) {
        next(err);
    }
};

const uploadMultiple = async (req, res, next) => {
    try {
        let files = req.files;

        if (files && !Array.isArray(files)) {
            files = [
                ...(files.image ?? []),
                ...(files.images ?? []),
            ];
        }

        if (!files || !files.length) {
            return error(res, 'No files uploaded', 400);
        }

        const uploaded = files.map((file) => ({
            url: file.path,
            publicId: file.filename,
            storageKey: file.storageKey || file.filename,
            originalName: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
        }));

        return success(
            res,
            {
                files: uploaded,
                count: uploaded.length,
            },
            'Files uploaded successfully',
            201,
        );
    } catch (err) {
        next(err);
    }
};

const deleteAsset = async (req, res, next) => {
    try {
        const { publicId, storageKey } = req.body;
        const key = storageKey || publicId;

        if (!key) {
            return error(res, 'storageKey or publicId is required', 400);
        }

        const result = await uploadService.deleteAsset(key);
        return success(res, result, 'Asset deleted');
    } catch (err) {
        next(err);
    }
};

const deleteMultiple = async (req, res, next) => {
    try {
        const { publicIds, storageKeys } = req.body;
        const keys = storageKeys || publicIds;

        if (!keys || !Array.isArray(keys) || !keys.length) {
            return error(res, 'storageKeys array is required', 400);
        }

        if (keys.length > 100) {
            return error(res, 'Cannot delete more than 100 assets at once', 400);
        }

        const result = await uploadService.deleteMultipleAssets(keys);
        return success(res, result, 'Assets deleted');
    } catch (err) {
        next(err);
    }
};

const listAssets = async (req, res, next) => {
    try {
        const { folder, maxResults, nextCursor } = req.query;

        if (!folder) {
            return error(res, 'folder query param is required', 400);
        }

        const { ALLOWED_LIST_PREFIXES } = require('../../constants/upload.constants');

        if (!ALLOWED_LIST_PREFIXES.includes(folder)) {
            return error(res, 'Invalid folder', 400);
        }

        const result = await uploadService.getFolderAssets(folder, {
            maxResults: maxResults ? parseInt(maxResults, 10) : 30,
            continuationToken: nextCursor,
        });

        return success(res, result, 'Assets fetched');
    } catch (err) {
        next(err);
    }
};

module.exports = {
    uploadSingle,
    uploadMultiple,
    deleteAsset,
    deleteMultiple,
    listAssets,
};
