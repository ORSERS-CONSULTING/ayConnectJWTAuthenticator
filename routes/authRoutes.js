const router = require('express').Router();
const ctrl = require('../controllers/authController');

router.post('/issue-token', ctrl.issueToken);
router.post('/refresh', ctrl.refresh);
router.post('/login', ctrl.login); // optional placeholder
router.post('/send-otp',   ctrl.sendOtp);     // public
router.post('/verify-otp', ctrl.verifyOtp);   // public -> returns app tokens
router.post('/resendClientCode', ctrl.getClientCode);
router.post('/getClientEmail', ctrl.getLoginClientEmail);
router.post('/loginClient', ctrl.loginClient);
router.post('/clienCodeExist', ctrl.clienCodeExist);
router.post('/register', ctrl.register);
router.post('/registerExistingClient', ctrl.registerExistingClientFromMainDB);
module.exports = router;
