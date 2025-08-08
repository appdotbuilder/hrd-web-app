import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, employeeProfilesTable } from '../db/schema';
import { type LoginInput, type RegisterInput } from '../schema';
import { login, register, getCurrentUser } from '../handlers/auth';
import { eq } from 'drizzle-orm';

// Test inputs
const testLoginInput: LoginInput = {
  email: 'test@example.com',
  password: 'password123'
};

const testRegisterInput: RegisterInput = {
  email: 'newuser@example.com',
  password: 'password123',
  role: 'employee',
  first_name: 'John',
  last_name: 'Doe',
  employee_id: 'EMP001',
  department: 'Engineering',
  position: 'Developer',
  phone: '123-456-7890'
};

const testManagerRegisterInput: RegisterInput = {
  email: 'manager@example.com',
  password: 'managerpass',
  role: 'manager',
  first_name: 'Jane',
  last_name: 'Smith',
  employee_id: 'MGR001',
  department: 'Engineering',
  position: 'Engineering Manager',
  phone: '098-765-4321'
};

describe('auth handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('register', () => {
    it('should create a new user and employee profile', async () => {
      const result = await register(testRegisterInput);

      // Verify user data
      expect(result.user.email).toBe('newuser@example.com');
      expect(result.user.role).toBe('employee');
      expect(result.user.is_active).toBe(true);
      expect(result.user.id).toBeDefined();
      expect(result.user.password_hash).toBeDefined();
      expect(result.user.created_at).toBeInstanceOf(Date);
      expect(result.user.updated_at).toBeInstanceOf(Date);

      // Verify profile data
      expect(result.profile.user_id).toBe(result.user.id);
      expect(result.profile.employee_id).toBe('EMP001');
      expect(result.profile.first_name).toBe('John');
      expect(result.profile.last_name).toBe('Doe');
      expect(result.profile.department).toBe('Engineering');
      expect(result.profile.position).toBe('Developer');
      expect(result.profile.phone).toBe('123-456-7890');
      expect(result.profile.id).toBeDefined();
      expect(result.profile.created_at).toBeInstanceOf(Date);
      expect(result.profile.updated_at).toBeInstanceOf(Date);

      // Fields not available in RegisterInput should be null
      expect(result.profile.salary).toBeNull();
      expect(result.profile.hire_date).toBeNull();
      expect(result.profile.manager_id).toBeNull();
    });

    it('should register manager with correct role', async () => {
      const result = await register(testManagerRegisterInput);

      expect(result.user.role).toBe('manager');
      expect(result.profile.employee_id).toBe('MGR001');
      expect(result.profile.first_name).toBe('Jane');
      expect(result.profile.last_name).toBe('Smith');
      expect(result.profile.position).toBe('Engineering Manager');

      // These fields are not available in RegisterInput schema
      expect(result.profile.salary).toBeNull();
      expect(result.profile.hire_date).toBeNull();
    });

    it('should save user and profile to database', async () => {
      const result = await register(testRegisterInput);

      // Verify user in database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.user.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('newuser@example.com');
      expect(users[0].role).toBe('employee');
      expect(users[0].is_active).toBe(true);

      // Verify profile in database
      const profiles = await db.select()
        .from(employeeProfilesTable)
        .where(eq(employeeProfilesTable.id, result.profile.id))
        .execute();

      expect(profiles).toHaveLength(1);
      expect(profiles[0].user_id).toBe(result.user.id);
      expect(profiles[0].employee_id).toBe('EMP001');
      expect(profiles[0].first_name).toBe('John');
      expect(profiles[0].salary).toBeNull(); // Not set during registration
    });

    it('should reject duplicate email', async () => {
      await register(testRegisterInput);

      await expect(register({
        ...testRegisterInput,
        employee_id: 'EMP002'
      })).rejects.toThrow(/email already registered/i);
    });

    it('should reject duplicate employee_id', async () => {
      await register(testRegisterInput);

      await expect(register({
        ...testRegisterInput,
        email: 'different@example.com'
      })).rejects.toThrow(/employee id already exists/i);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      // Create test user for login tests
      await register({
        ...testRegisterInput,
        email: testLoginInput.email,
        password: testLoginInput.password
      });
    });

    it('should authenticate valid credentials', async () => {
      const result = await login(testLoginInput);

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('employee');
      expect(result.user.is_active).toBe(true);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(10);
      expect(result.user.created_at).toBeInstanceOf(Date);
      expect(result.user.updated_at).toBeInstanceOf(Date);
    });

    it('should reject invalid email', async () => {
      await expect(login({
        email: 'nonexistent@example.com',
        password: 'password123'
      })).rejects.toThrow(/invalid credentials/i);
    });

    it('should reject invalid password', async () => {
      await expect(login({
        email: testLoginInput.email,
        password: 'wrongpassword'
      })).rejects.toThrow(/invalid credentials/i);
    });

    it('should reject inactive user', async () => {
      // Deactivate user
      await db.update(usersTable)
        .set({ is_active: false })
        .where(eq(usersTable.email, testLoginInput.email))
        .execute();

      await expect(login(testLoginInput)).rejects.toThrow(/account is inactive/i);
    });
  });

  describe('getCurrentUser', () => {
    let testUserId: number;

    beforeEach(async () => {
      const result = await register(testRegisterInput);
      testUserId = result.user.id;
    });

    it('should get user with profile data', async () => {
      const result = await getCurrentUser(testUserId);

      // Verify user data
      expect(result.email).toBe('newuser@example.com');
      expect(result.role).toBe('employee');
      expect(result.is_active).toBe(true);
      expect(result.id).toBe(testUserId);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);

      // Verify profile data
      expect(result.profile.user_id).toBe(testUserId);
      expect(result.profile.employee_id).toBe('EMP001');
      expect(result.profile.first_name).toBe('John');
      expect(result.profile.last_name).toBe('Doe');
      expect(result.profile.department).toBe('Engineering');
      expect(result.profile.position).toBe('Developer');
      expect(result.profile.phone).toBe('123-456-7890');
      expect(result.profile.created_at).toBeInstanceOf(Date);
      expect(result.profile.updated_at).toBeInstanceOf(Date);

      // Fields not set during registration should be null
      expect(result.profile.salary).toBeNull();
      expect(result.profile.hire_date).toBeNull();
      expect(result.profile.manager_id).toBeNull();
    });

    it('should handle user with manually set salary', async () => {
      // Manually update salary in database to test numeric conversion
      await db.update(employeeProfilesTable)
        .set({ salary: '50000.00' })
        .where(eq(employeeProfilesTable.user_id, testUserId))
        .execute();

      const result = await getCurrentUser(testUserId);

      expect(result.profile.salary).toBe(50000);
      expect(typeof result.profile.salary).toBe('number');
    });

    it('should reject non-existent user', async () => {
      await expect(getCurrentUser(99999)).rejects.toThrow(/user not found/i);
    });
  });
});