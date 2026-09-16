const express = require('express');
const multer = require('multer');
const router = express.Router();
const agentController = require('./agent.controller');
const { optionalAuthenticate } = require('../../middlewares/auth.middleware');
const { config } = require('./agent.config');
const { isSupportedAudio } = require('./agent.voice');

/**
 * Voice clips are held in memory and forwarded straight on for transcription —
 * they are never written to disk. The format is checked here so an unsupported
 * upload is rejected before it consumes an upstream call.
 */
const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxAudioBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (isSupportedAudio(file.mimetype)) return cb(null, true);
        cb(Object.assign(new Error('That audio format is not supported.'), { statusCode: 400 }));
    },
});

/**
 * Guests and signed-in customers both use the agent, so authentication is
 * optional — but when a token is present it is verified, and the agent's
 * cart/order tools act strictly on that verified identity.
 */
router.get('/status', agentController.status);

router.use(optionalAuthenticate);

router.post('/chat', agentController.chat);
router.post('/transcribe', audioUpload.single('audio'), agentController.transcribe);
router.post('/reset', agentController.resetConversation);

module.exports = router;
