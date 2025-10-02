const router = require('express').Router();
const { authUser } = require('../middleware/authUser');
const ctrl = require('../controllers/ayconnectController');

router.get('/services', authUser, ctrl.getServices);
router.get('/user-docs', authUser, ctrl.getUserDocs);
router.get('/document-types', authUser, ctrl.getDocumentTypes);
router.get('/getProcedures', authUser, ctrl.getProcedures);
router.get('/getDepartments', authUser, ctrl.getDepartments);
router.post('/uploadUserDocuments', authUser, ctrl.uploadUserDocuments);

module.exports = router;
