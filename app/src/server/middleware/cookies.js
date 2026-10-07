import { parseCookieHeader } from '../utils/cookies.js';

export function parseCookies(req, _res, next) {
  const header = req.headers.cookie;
  req.cookies = header ? parseCookieHeader(header) : {};
  next();
}
