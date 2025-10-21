const router = require('express').Router();
const multer = require('multer');
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB cap
const { authUser } = require('../middleware/authUser');
const ctrl = require('../controllers/ayconnectController');

router.get('/services', authUser, ctrl.getServices);
router.get('/user-docs', authUser, ctrl.getUserDocs);
router.get('/document-types', authUser, ctrl.getDocumentTypes);
router.get('/getProcedures', authUser, ctrl.getProcedures);
router.get('/getDepartments', authUser, ctrl.getDepartments);
router.post('/uploadUserDocuments', authUser, ctrl.uploadUserDocuments);
router.get("/user/Avatar", ctrl.getUserAvatar);
router.post("/user/Avatar", upload.single("avatar"), ctrl.uploadUserAvatar);

module.exports = router;
