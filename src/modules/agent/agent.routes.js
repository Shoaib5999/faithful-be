const express = require('express');
const router = express.Router();
const agentController = require('./agent.controller');
const { optionalAuthenticate } = require('../../middlewares/auth.middleware');

/**
 * Guests and signed-in customers both use the agent, so authentication is
 * optional — but when a token is present it is verified, and the agent's
 * cart/order tools act strictly on that verified identity.
 */
router.get('/status', agentController.status);

router.use(optionalAuthenticate);

router.post('/chat', agentController.chat);
router.post('/reset', agentController.resetConversation);

module.exports = router;
