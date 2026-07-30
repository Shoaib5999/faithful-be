const r2Service = require('../../services/r2.service');

const deleteAsset = async (storageKey) => r2Service.deleteObject(storageKey);

const deleteMultipleAssets = async (storageKeys) =>
    r2Service.deleteMultipleObjects(storageKeys);

const getFolderAssets = async (folderPrefix, options = {}) =>
    r2Service.listFolderObjects(folderPrefix, options);

module.exports = { deleteAsset, deleteMultipleAssets, getFolderAssets };
