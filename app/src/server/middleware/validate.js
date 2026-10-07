// Runs a validator from src/server/validators on the request body (or query)
// and stores the normalized result on req.validated. Validators throw
// AppError(VALIDATION_ERROR) with per-field details on bad input.
export function validate(validator, source = 'body') {
  return (req, _res, next) => {
    try {
      const value = source === 'query' ? req.query : req.body;
      req.validated = validator(value);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
