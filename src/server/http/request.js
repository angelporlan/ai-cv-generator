function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const rawBody = Buffer.concat(chunks).toString();
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

module.exports = {
  readRequestBody
};
