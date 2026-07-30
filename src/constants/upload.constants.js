/** Max bytes per uploaded file (multer). Raise nginx client_max_body_size to match or exceed. */
const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;

/** R2 object key prefixes (one folder per admin asset type). */
const UPLOAD_FOLDERS = {
    products: 'products',
    banners: 'banners',
    logos: 'logos',
    cutTypes: 'cut-types',
    categories: 'categories',
    sliders: 'sliders',
    general: 'general',
};

const ALLOWED_LIST_PREFIXES = Object.values(UPLOAD_FOLDERS);

module.exports = { UPLOAD_FOLDERS, ALLOWED_LIST_PREFIXES, MAX_UPLOAD_FILE_BYTES };
