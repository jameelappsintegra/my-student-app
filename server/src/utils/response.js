function sendSuccess(res, { status = 200, message, data, pagination }) {
  const body = { success: true, message };
  if (data !== undefined) body.data = data;
  if (pagination) body.pagination = pagination;
  return res.status(status).json(body);
}

module.exports = { sendSuccess };
