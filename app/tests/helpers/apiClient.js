// Cookie-jar HTTP client for integration tests: stores cookies across
// requests and automatically handles the double-submit CSRF token.

export class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
    this.csrfToken = null;
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  setCookie(name, value) {
    this.cookies.set(name, value);
  }

  storeCookies(response) {
    const setCookies =
      typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const line of setCookies) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      if (index === -1) {
        continue;
      }
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const isDeletion = /max-age=0/i.test(line) || /expires=thu,\s*01 jan 1970/i.test(line);
      if (isDeletion) {
        this.cookies.delete(name);
        if (name === 'hd_csrf') {
          this.csrfToken = null;
        }
        continue;
      }
      this.cookies.set(name, value);
      if (name === 'hd_csrf') {
        this.csrfToken = decodeURIComponent(value);
      }
    }
  }

  async ensureCsrf() {
    if (this.csrfToken) {
      return;
    }
    const response = await this.request('GET', '/api/auth/csrf');
    if (response.body?.data?.token) {
      this.csrfToken = response.body.data.token;
    }
  }

  async request(method, path, { body, csrf = true, headers = {} } = {}) {
    const isUnsafe = method !== 'GET' && method !== 'HEAD';
    const finalHeaders = { Accept: 'application/json', ...headers };
    if (isUnsafe && csrf) {
      await this.ensureCsrf();
      if (this.csrfToken) {
        finalHeaders['X-CSRF-Token'] = this.csrfToken;
      }
    }
    const cookie = this.cookieHeader();
    if (cookie) {
      finalHeaders.Cookie = cookie;
    }
    if (body !== undefined) {
      finalHeaders['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.storeCookies(response);
    const parsed = await response.json().catch(() => null);
    return { status: response.status, headers: response.headers, body: parsed };
  }

  get(path) {
    return this.request('GET', path);
  }

  post(path, body, options) {
    return this.request('POST', path, { body, ...options });
  }

  patch(path, body, options) {
    return this.request('PATCH', path, { body, ...options });
  }

  del(path, options) {
    return this.request('DELETE', path, options);
  }

  // Raw binary upload (POST with a Buffer body); used for diary attachments.
  async upload(path, buffer, { filename = 'image', contentType = 'application/octet-stream' } = {}) {
    await this.ensureCsrf();
    const headers = {
      Accept: 'application/json',
      'Content-Type': contentType,
      'X-Filename': encodeURIComponent(filename),
      Cookie: this.cookieHeader(),
    };
    if (this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: buffer,
    });
    this.storeCookies(response);
    const parsed = await response.json().catch(() => null);
    return { status: response.status, headers: response.headers, body: parsed };
  }
}
