import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, employeeProfilesTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput } from '../schema';
import { 
  getAllUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  deleteUser, 
  getUsersByRole, 
  getUsersByDepartment 
} from '../handlers/user_management';
import { eq } from 'drizzle-orm';

const testCreateInput: CreateUserInput = {
  email: 'john.doe@company.com',
  password: 'securepassword123',
  role: 'employee',
  first_name: 'John',
  last_name: 'Doe',
  employee_id: 'EMP001',
  department: 'Engineering',
  position: 'Software Developer',
  phone: '+1234567890',
  hire_date: new Date('2024-01-15'),
  salary: 75000,
  manager_id: undefined
};

const testManagerInput: CreateUserInput = {
  email: 'jane.manager@company.com',
  password: 'managerpass123',
  role: 'manager',
  first_name: 'Jane',
  last_name: 'Manager',
  employee_id: 'MGR001',
  department: 'Engineering',
  position: 'Engineering Manager',
  phone: '+1234567891',
  hire_date: new Date('2023-06-01'),
  salary: 95000
};

describe('User Management Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createUser', () => {
    it('should create a user with employee profile', async () => {
      const result = await createUser(testCreateInput);

      expect(result.email).toBe('john.doe@company.com');
      expect(result.role).toBe('employee');
      expect(result.is_active).toBe(true);
      expect(result.password_hash).toBeDefined();
      expect(result.password_hash).not.toBe('securepassword123'); // Should be hashed
      expect(result.password_hash).toMatch(/^hashed_/); // Should start with 'hashed_'
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);

      expect(result.profile.employee_id).toBe('EMP001');
      expect(result.profile.first_name).toBe('John');
      expect(result.profile.last_name).toBe('Doe');
      expect(result.profile.department).toBe('Engineering');
      expect(result.profile.position).toBe('Software Developer');
      expect(result.profile.phone).toBe('+1234567890');
      expect(result.profile.salary).toBe(75000);
      expect(typeof result.profile.salary).toBe('number');
      expect(result.profile.hire_date).toEqual(new Date('2024-01-15'));
      expect(result.profile.manager_id).toBeNull();
    });

    it('should create user with manager relationship', async () => {
      // Create manager first
      const manager = await createUser(testManagerInput);

      // Create employee with manager
      const employeeInput = {
        ...testCreateInput,
        employee_id: 'EMP002',
        email: 'employee@company.com',
        manager_id: manager.profile.id
      };

      const result = await createUser(employeeInput);

      expect(result.profile.manager_id).toBe(manager.profile.id);
    });

    it('should save user to database correctly', async () => {
      const result = await createUser(testCreateInput);

      // Verify user in database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('john.doe@company.com');
      expect(users[0].role).toBe('employee');
      expect(users[0].is_active).toBe(true);

      // Verify profile in database
      const profiles = await db.select()
        .from(employeeProfilesTable)
        .where(eq(employeeProfilesTable.user_id, result.id))
        .execute();

      expect(profiles).toHaveLength(1);
      expect(profiles[0].employee_id).toBe('EMP001');
      expect(profiles[0].first_name).toBe('John');
      expect(parseFloat(profiles[0].salary!)).toBe(75000);
    });

    it('should throw error for invalid manager_id', async () => {
      const inputWithInvalidManager = {
        ...testCreateInput,
        manager_id: 99999
      };

      await expect(createUser(inputWithInvalidManager)).rejects.toThrow(/manager not found/i);
    });
  });

  describe('getAllUsers', () => {
    it('should return empty array when no users exist', async () => {
      const result = await getAllUsers();
      expect(result).toEqual([]);
    });

    it('should return all users with profiles', async () => {
      // Create multiple users
      await createUser(testCreateInput);
      await createUser({
        ...testManagerInput,
        employee_id: 'MGR002',
        email: 'manager2@company.com'
      });

      const result = await getAllUsers();

      expect(result).toHaveLength(2);
      expect(result[0].email).toBeDefined();
      expect(result[0].profile.first_name).toBeDefined();
      expect(result[0].profile.salary).toBeTypeOf('number');
      
      // Verify all users have both user and profile data
      result.forEach(user => {
        expect(user.id).toBeDefined();
        expect(user.email).toBeDefined();
        expect(user.role).toBeDefined();
        expect(user.profile.employee_id).toBeDefined();
        expect(user.profile.first_name).toBeDefined();
        expect(user.profile.last_name).toBeDefined();
      });
    });
  });

  describe('getUserById', () => {
    it('should return null for non-existent user', async () => {
      const result = await getUserById(99999);
      expect(result).toBeNull();
    });

    it('should return user with profile for valid ID', async () => {
      const created = await createUser(testCreateInput);
      const result = await getUserById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(created.id);
      expect(result!.email).toBe('john.doe@company.com');
      expect(result!.profile.employee_id).toBe('EMP001');
      expect(result!.profile.salary).toBe(75000);
      expect(typeof result!.profile.salary).toBe('number');
    });
  });

  describe('updateUser', () => {
    it('should update user fields successfully', async () => {
      const created = await createUser(testCreateInput);

      const updateInput: UpdateUserInput = {
        id: created.id,
        email: 'john.updated@company.com',
        role: 'manager',
        is_active: false,
        first_name: 'Jonathan',
        salary: 85000,
        department: 'Product'
      };

      const result = await updateUser(updateInput);

      expect(result.email).toBe('john.updated@company.com');
      expect(result.role).toBe('manager');
      expect(result.is_active).toBe(false);
      expect(result.profile.first_name).toBe('Jonathan');
      expect(result.profile.salary).toBe(85000);
      expect(result.profile.department).toBe('Product');
      expect(result.profile.last_name).toBe('Doe'); // Should remain unchanged
    });

    it('should update only provided fields', async () => {
      const created = await createUser(testCreateInput);

      const partialUpdate: UpdateUserInput = {
        id: created.id,
        first_name: 'Johnny'
      };

      const result = await updateUser(partialUpdate);

      expect(result.profile.first_name).toBe('Johnny');
      expect(result.email).toBe('john.doe@company.com'); // Should remain unchanged
      expect(result.role).toBe('employee'); // Should remain unchanged
      expect(result.profile.salary).toBe(75000); // Should remain unchanged
    });

    it('should validate manager_id on update', async () => {
      const created = await createUser(testCreateInput);

      const updateInput: UpdateUserInput = {
        id: created.id,
        manager_id: 99999
      };

      await expect(updateUser(updateInput)).rejects.toThrow(/manager not found/i);
    });

    it('should throw error for non-existent user', async () => {
      const updateInput: UpdateUserInput = {
        id: 99999,
        first_name: 'Test'
      };

      await expect(updateUser(updateInput)).rejects.toThrow(/user not found/i);
    });

    it('should handle null salary correctly', async () => {
      const created = await createUser(testCreateInput);

      const updateInput: UpdateUserInput = {
        id: created.id,
        salary: null
      };

      const result = await updateUser(updateInput);
      expect(result.profile.salary).toBeNull();
    });
  });

  describe('deleteUser', () => {
    it('should deactivate user instead of deleting', async () => {
      const created = await createUser(testCreateInput);

      const result = await deleteUser(created.id);
      expect(result).toBe(true);

      // Verify user is deactivated, not deleted
      const user = await getUserById(created.id);
      expect(user).not.toBeNull();
      expect(user!.is_active).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      const result = await deleteUser(99999);
      expect(result).toBe(false);
    });
  });

  describe('getUsersByRole', () => {
    it('should return empty array for non-existent role', async () => {
      const result = await getUsersByRole('admin');
      expect(result).toEqual([]);
    });

    it('should return users filtered by role', async () => {
      // Create users with different roles
      await createUser(testCreateInput); // employee
      await createUser(testManagerInput); // manager
      await createUser({
        ...testCreateInput,
        email: 'admin@company.com',
        employee_id: 'ADM001',
        role: 'admin'
      });

      const employees = await getUsersByRole('employee');
      const managers = await getUsersByRole('manager');
      const admins = await getUsersByRole('admin');

      expect(employees).toHaveLength(1);
      expect(employees[0].role).toBe('employee');
      expect(employees[0].profile.salary).toBeTypeOf('number');

      expect(managers).toHaveLength(1);
      expect(managers[0].role).toBe('manager');

      expect(admins).toHaveLength(1);
      expect(admins[0].role).toBe('admin');
    });
  });

  describe('getUsersByDepartment', () => {
    it('should return empty array for non-existent department', async () => {
      const result = await getUsersByDepartment('Marketing');
      expect(result).toEqual([]);
    });

    it('should return users filtered by department', async () => {
      // Create users in different departments
      await createUser(testCreateInput); // Engineering
      await createUser({
        ...testCreateInput,
        email: 'sales@company.com',
        employee_id: 'SAL001',
        department: 'Sales'
      });

      const engineeringUsers = await getUsersByDepartment('Engineering');
      const salesUsers = await getUsersByDepartment('Sales');

      expect(engineeringUsers).toHaveLength(1);
      expect(engineeringUsers[0].profile.department).toBe('Engineering');
      expect(engineeringUsers[0].profile.salary).toBeTypeOf('number');

      expect(salesUsers).toHaveLength(1);
      expect(salesUsers[0].profile.department).toBe('Sales');
    });

    it('should handle multiple users in same department', async () => {
      await createUser(testCreateInput);
      await createUser({
        ...testManagerInput,
        email: 'eng2@company.com',
        employee_id: 'ENG002'
      });

      const engineeringUsers = await getUsersByDepartment('Engineering');
      expect(engineeringUsers).toHaveLength(2);
      
      engineeringUsers.forEach(user => {
        expect(user.profile.department).toBe('Engineering');
      });
    });
  });

  describe('numeric field handling', () => {
    it('should handle salary conversion correctly', async () => {
      const created = await createUser(testCreateInput);

      // Verify salary is returned as number
      expect(typeof created.profile.salary).toBe('number');
      expect(created.profile.salary).toBe(75000);

      // Verify it's stored as numeric string in database
      const dbResult = await db.select()
        .from(employeeProfilesTable)
        .where(eq(employeeProfilesTable.id, created.profile.id))
        .execute();

      expect(typeof dbResult[0].salary).toBe('string');
      expect(parseFloat(dbResult[0].salary!)).toBe(75000);
    });
  });
});