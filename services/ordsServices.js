const axios = require('axios');
const { GATEWAY_BASE_URL } = require('../config/env');
const { getIdcsToken } = require('./idcsServices');

async function callGateway(method, path, { params, data } = {}) {
  const url = `${GATEWAY_BASE_URL}/${path}`;
  const token = await getIdcsToken(url);
  const res = await axios({ url, method, params, data, headers: { Authorization: `Bearer ${token}` } });
  return res.data;
}

function sendMobileOtp(mobile_number) { return callGateway('POST', 'send-mobile-otp', { params: { mobile_number } }); }
function verifyMobileOtp(mobile, otp) { return callGateway('POST', 'verify-mobile-otp', { params: { mobile_number: mobile, otp_code: otp } }); }
function sendEmailOtp(email) { return callGateway('POST', 'send-email-otp', { params: { email } }); }
function verifyEmailOtp(email, otp) { return callGateway('POST', 'verify-email-otp', { params: { email, otp_code: otp } }); }
function ordsLogin({ email, mobile_number }) {
  const params = {};
  if (email) params.email = email;
  if (mobile_number) params.mobile_number = mobile_number;
  // only the present one will be sent as a query param
  return callGateway('POST', 'login', { params });
}
function registerClient({ client_code }) { return callGateway('POST', 'register-client', { params: { client_code } }) }
function checkClientCode({ client_code }) { return callGateway('POST', 'check-client-code', { params: { client_code } }) }
function registerExistingClient({client_code}){ return callGateway('POST', 'register-existing-client', { paramS: { client_code}})}
function registerUser({ email, mobile_number, full_name }) {
  if (!email || !mobile_number || !full_name) {
    throw new Error('Please fill all the fileds');
  }

  return callGateway('POST', 'register', {params});
}
function resendClientCode({email}){
  if (!email) {
    throw new Error('Please fill all the fileds');
  }

  return callGateway('POST', 'resend-Walking-Code', {params : {email}})
}
function getClientEmail({ client_code }) {
  if (!client_code) {
    throw new Error('client_code is required');
  }
  return callGateway('POST', 'getExistedClientEmail', { params: { client_code } });
}
function ordsGetServices(){
  return callGateway('GET', 'getServices')
}
function ordsGetDepartments(){
  return callGateway('GET', 'getDepartments')
}
function ordsGetProcedures(){
  return callGateway('GET', 'getProcedures')
}
function ordsGetUserDocs(user_id) {
  return callGateway('GET', 'show-user-documents', { params: { user_id } }); // adjust path/name to your ORDS
}
function ordsGetDocumentTypes() {
  // no params needed; still goes through callGateway which adds the IDCS token
  return callGateway('GET', 'document-types');
}
function uploadDocuments(docPayload) {
  return callGateway('POST', 'upload-documents', {
    data: docPayload,
    headers: { 'Content-Type': 'application/json' },
  });
}
module.exports = { callGateway, resendClientCode, getClientEmail, sendMobileOtp, verifyMobileOtp, sendEmailOtp, verifyEmailOtp, ordsLogin, registerClient, checkClientCode, registerUser, registerExistingClient, ordsGetServices, ordsGetUserDocs, ordsGetDocumentTypes, uploadDocuments, ordsGetProcedures, ordsGetDepartments };
