const multer = require('multer');
const r2Service = require('../services/r2.service');
const { UPLOAD_FOLDERS, MAX_UPLOAD_FILE_BYTES } = require('../constants/upload.constants');

const IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);

const VIDEO_MIME_TYPES = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
]);

const getFileExtension = (filename) => {
    const dot = (filename || '').lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
};

const fileFilter = (req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const allowed = new Set([...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES]);

    if (allowed.has(mime)) {
        cb(null, true);
        return;
    }

    if (IMAGE_EXTENSIONS.has(getFileExtension(file.originalname))) {
        cb(null, true);
        return;
    }

    cb(new Error(`Unsupported file type: ${file.mimetype || 'unknown'}`));
};

const memoryUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: {
        fileSize: MAX_UPLOAD_FILE_BYTES,
        files: 10,
    },
});

const attachR2Upload = (folderKey) => async (req, res, next) => {
    try {
        const uploadOne = async (file) => {
            const uploaded = await r2Service.uploadFromMulterFile(file, folderKey);
            file.path = uploaded.url;
            file.filename = uploaded.key;
            file.storageKey = uploaded.key;
            return file;
        };

        if (req.file) {
            await uploadOne(req.file);
        }

        if (Array.isArray(req.files) && req.files.length) {
            for (let i = 0; i < req.files.length; i += 1) {
                req.files[i] = await uploadOne(req.files[i]);
            }
        } else if (req.files && typeof req.files === 'object') {
            for (const fieldFiles of Object.values(req.files)) {
                if (!Array.isArray(fieldFiles)) continue;
                for (let i = 0; i < fieldFiles.length; i += 1) {
                    fieldFiles[i] = await uploadOne(fieldFiles[i]);
                }
            }
        }

        next();
    } catch (err) {
        next(err);
    }
};

const withR2 = (folderKey, multerMiddleware) => [multerMiddleware, attachR2Upload(folderKey)];

const uploadProducts = withR2(
    'products',
    memoryUpload.array('images', 8),
);

const uploadBanner = withR2(
    'banners',
    memoryUpload.single('image'),
);

const uploadBanners = withR2(
    'banners',
    memoryUpload.array('images', 5),
);

const uploadLogo = withR2(
    'logos',
    memoryUpload.single('image'),
);

const uploadCutType = withR2(
    'cut-types',
    memoryUpload.single('image'),
);

const uploadCategory = withR2(
    'categories',
    memoryUpload.single('image'),
);

const uploadSlider = withR2(
    'sliders',
    memoryUpload.single('image'),
);

const uploadProduct = withR2(
    'products',
    memoryUpload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'images', maxCount: 8 },
    ]),
);

const uploadGeneral = withR2(
    'general',
    memoryUpload.single('file'),
);

const uploadGeneralMultiple = withR2(
    'general',
    memoryUpload.array('files', 10),
);

/** @deprecated Use storage.js exports — kept for legacy imports */
const upload = uploadProducts;

module.exports = {
    UPLOAD_FOLDERS,
    upload,
    uploadProducts,
    uploadBanner,
    uploadBanners,
    uploadLogo,
    uploadCutType,
    uploadCategory,
    uploadSlider,
    uploadProduct,
    uploadGeneral,
    uploadGeneralMultiple,
};
