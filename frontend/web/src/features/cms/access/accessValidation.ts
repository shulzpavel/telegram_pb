export const ADMIN_PASSWORD_MIN_LENGTH = 8;
export const ADMIN_USERNAME_PATTERN = /^[A-Za-z0-9_.@-]+$/;

interface CreateAdminValidationInput {
  username: string;
  password: string;
  roleIds: number[];
}

export function validateCreateAdminInput(input: CreateAdminValidationInput): string[] {
  const errors: string[] = [];
  const username = input.username.trim();

  if (!username) {
    errors.push("Username is required.");
  } else if (!ADMIN_USERNAME_PATTERN.test(username)) {
    errors.push("Username may contain only letters, numbers, dot, underscore, dash, and @.");
  }

  if (input.password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`);
  }

  if (input.roleIds.length === 0) {
    errors.push("Select at least one role.");
  }

  return errors;
}
