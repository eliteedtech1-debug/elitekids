'use strict';

const STATUS_CODES = {
  400: 'VALIDATION_ERROR',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'ACCESS_DENIED',
  404: 'RESOURCE_NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

function errorCodeForStatus(status) {
  return STATUS_CODES[status] || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'API_ERROR');
}

function errorResponse(res, status, errorCode, message, extra = {}) {
  return res.status(status).json({
    success: false,
    error_code: errorCode || errorCodeForStatus(status),
    message,
    ...extra,
  });
}

module.exports = { errorCodeForStatus, errorResponse };
