import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, employeeProfilesTable, departmentsTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  getAllDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentEmployees
} from '../handlers/departments';

describe('departments handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test users and employees
  const createTestUserAndEmployee = async (email: string, firstName: string, lastName: string, employeeId: string, department?: string) => {
    const userResult = await db.insert(usersTable)
      .values({
        email,
        password_hash: 'hashed_password',
        role: 'employee'
      })
      .returning()
      .execute();

    const employeeResult = await db.insert(employeeProfilesTable)
      .values({
        user_id: userResult[0].id,
        employee_id: employeeId,
        first_name: firstName,
        last_name: lastName,
        department: department || null,
        position: 'Software Engineer'
      })
      .returning()
      .execute();

    return { user: userResult[0], employee: employeeResult[0] };
  };

  describe('createDepartment', () => {
    it('should create a department without manager', async () => {
      const input = {
        name: 'Engineering',
        description: 'Software development team'
      };

      const result = await createDepartment(input);

      expect(result.name).toEqual('Engineering');
      expect(result.description).toEqual('Software development team');
      expect(result.manager_id).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a department with manager', async () => {
      // Create manager first
      const { employee: manager } = await createTestUserAndEmployee(
        'manager@test.com',
        'John',
        'Manager',
        'MGR001'
      );

      const input = {
        name: 'HR Department',
        description: 'Human Resources',
        manager_id: manager.id
      };

      const result = await createDepartment(input);

      expect(result.name).toEqual('HR Department');
      expect(result.description).toEqual('Human Resources');
      expect(result.manager_id).toEqual(manager.id);
    });

    it('should save department to database', async () => {
      const input = {
        name: 'Marketing',
        description: 'Marketing and sales'
      };

      const result = await createDepartment(input);

      const departments = await db.select()
        .from(departmentsTable)
        .where(eq(departmentsTable.id, result.id))
        .execute();

      expect(departments).toHaveLength(1);
      expect(departments[0].name).toEqual('Marketing');
      expect(departments[0].description).toEqual('Marketing and sales');
    });

    it('should throw error for non-existent manager', async () => {
      const input = {
        name: 'Invalid Dept',
        manager_id: 9999
      };

      await expect(createDepartment(input)).rejects.toThrow(/manager not found/i);
    });
  });

  describe('getAllDepartments', () => {
    it('should return empty array when no departments exist', async () => {
      const result = await getAllDepartments();
      expect(result).toEqual([]);
    });

    it('should return all departments with manager info and employee count', async () => {
      // Create manager and employees
      const { employee: manager } = await createTestUserAndEmployee(
        'manager@test.com',
        'Jane',
        'Manager',
        'MGR001'
      );

      // Create department
      const dept = await createDepartment({
        name: 'Engineering',
        description: 'Tech team',
        manager_id: manager.id
      });

      // Create employees in the department
      await createTestUserAndEmployee('emp1@test.com', 'John', 'Doe', 'EMP001', 'Engineering');
      await createTestUserAndEmployee('emp2@test.com', 'Jane', 'Smith', 'EMP002', 'Engineering');

      const result = await getAllDepartments();

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('Engineering');
      expect(result[0].description).toEqual('Tech team');
      expect(result[0].manager).toBeDefined();
      expect(result[0].manager?.first_name).toEqual('Jane');
      expect(result[0].manager?.last_name).toEqual('Manager');
      expect(result[0].employee_count).toEqual(2);
    });

    it('should handle departments without managers', async () => {
      await createDepartment({
        name: 'No Manager Dept',
        description: 'Department without manager'
      });

      const result = await getAllDepartments();

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('No Manager Dept');
      expect(result[0].manager).toBeUndefined();
      expect(result[0].employee_count).toEqual(0);
    });
  });

  describe('getDepartmentById', () => {
    it('should return null for non-existent department', async () => {
      const result = await getDepartmentById(9999);
      expect(result).toBeNull();
    });

    it('should return department with manager and employees', async () => {
      // Create manager
      const { employee: manager } = await createTestUserAndEmployee(
        'manager@test.com',
        'Alice',
        'Manager',
        'MGR001'
      );

      // Create department
      const dept = await createDepartment({
        name: 'HR',
        description: 'Human Resources',
        manager_id: manager.id
      });

      // Create employees in the department
      const { employee: emp1 } = await createTestUserAndEmployee('emp1@test.com', 'Bob', 'Employee', 'EMP001', 'HR');
      const { employee: emp2 } = await createTestUserAndEmployee('emp2@test.com', 'Carol', 'Staff', 'EMP002', 'HR');

      const result = await getDepartmentById(dept.id);

      expect(result).not.toBeNull();
      expect(result?.name).toEqual('HR');
      expect(result?.description).toEqual('Human Resources');
      expect(result?.manager).toBeDefined();
      expect(result?.manager?.first_name).toEqual('Alice');
      expect(result?.employees).toHaveLength(2);
      expect(result?.employees?.[0].first_name).toEqual('Carol'); // Most recent first
      expect(result?.employees?.[1].first_name).toEqual('Bob');
    });

    it('should return department without manager', async () => {
      const dept = await createDepartment({
        name: 'Solo Dept',
        description: 'No manager'
      });

      const result = await getDepartmentById(dept.id);

      expect(result).not.toBeNull();
      expect(result?.name).toEqual('Solo Dept');
      expect(result?.manager).toBeUndefined();
      expect(result?.employees).toEqual([]);
    });
  });

  describe('updateDepartment', () => {
    it('should update department name and description', async () => {
      const dept = await createDepartment({
        name: 'Old Name',
        description: 'Old description'
      });

      const result = await updateDepartment(dept.id, {
        name: 'New Name',
        description: 'New description'
      });

      expect(result.name).toEqual('New Name');
      expect(result.description).toEqual('New description');
      expect(result.manager_id).toEqual(dept.manager_id);
    });

    it('should update department manager', async () => {
      const { employee: newManager } = await createTestUserAndEmployee(
        'newmanager@test.com',
        'New',
        'Manager',
        'MGR002'
      );

      const dept = await createDepartment({
        name: 'Test Dept'
      });

      const result = await updateDepartment(dept.id, {
        manager_id: newManager.id
      });

      expect(result.manager_id).toEqual(newManager.id);
      expect(result.name).toEqual('Test Dept'); // Unchanged
    });

    it('should throw error for non-existent department', async () => {
      await expect(updateDepartment(9999, { name: 'New Name' }))
        .rejects.toThrow(/department not found/i);
    });

    it('should throw error for non-existent manager', async () => {
      const dept = await createDepartment({
        name: 'Test Dept'
      });

      await expect(updateDepartment(dept.id, { manager_id: 9999 }))
        .rejects.toThrow(/manager not found/i);
    });
  });

  describe('deleteDepartment', () => {
    it('should delete empty department', async () => {
      const dept = await createDepartment({
        name: 'Empty Dept'
      });

      const result = await deleteDepartment(dept.id);

      expect(result).toBe(true);

      // Verify deletion
      const departments = await db.select()
        .from(departmentsTable)
        .where(eq(departmentsTable.id, dept.id))
        .execute();

      expect(departments).toHaveLength(0);
    });

    it('should throw error for department with employees', async () => {
      const dept = await createDepartment({
        name: 'Busy Dept'
      });

      // Add employee to department
      await createTestUserAndEmployee('emp@test.com', 'John', 'Doe', 'EMP001', 'Busy Dept');

      await expect(deleteDepartment(dept.id))
        .rejects.toThrow(/cannot delete department with assigned employees/i);
    });

    it('should throw error for non-existent department', async () => {
      await expect(deleteDepartment(9999))
        .rejects.toThrow(/department not found/i);
    });
  });

  describe('getDepartmentEmployees', () => {
    it('should return empty array for department with no employees', async () => {
      const result = await getDepartmentEmployees('Non-existent Dept');
      expect(result).toEqual([]);
    });

    it('should return all employees in department', async () => {
      // Create department
      await createDepartment({
        name: 'IT Department'
      });

      // Create employees in the department
      const { user: user1 } = await createTestUserAndEmployee('dev1@test.com', 'Alice', 'Developer', 'DEV001', 'IT Department');
      const { user: user2 } = await createTestUserAndEmployee('dev2@test.com', 'Bob', 'Senior Dev', 'DEV002', 'IT Department');

      const result = await getDepartmentEmployees('IT Department');

      expect(result).toHaveLength(2);
      expect(result[0].first_name).toEqual('Bob'); // Most recent first
      expect(result[0].employee_id).toEqual('DEV002');
      expect(result[0].email).toEqual('dev2@test.com');
      expect(result[1].first_name).toEqual('Alice');
      expect(result[1].employee_id).toEqual('DEV001');
      expect(result[1].email).toEqual('dev1@test.com');
    });

    it('should convert numeric salary correctly', async () => {
      // Create department
      await createDepartment({
        name: 'Sales'
      });

      // Create employee with salary
      const { employee } = await createTestUserAndEmployee('sales@test.com', 'John', 'Sales', 'SALES001', 'Sales');
      
      // Update employee with salary
      await db.update(employeeProfilesTable)
        .set({ salary: '75000.50' })
        .where(eq(employeeProfilesTable.id, employee.id))
        .execute();

      const result = await getDepartmentEmployees('Sales');

      expect(result).toHaveLength(1);
      expect(typeof result[0].salary).toBe('number');
      expect(result[0].salary).toEqual(75000.5);
    });
  });
});