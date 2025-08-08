import { db } from '../db';
import { departmentsTable, employeeProfilesTable, usersTable } from '../db/schema';
import { type Department } from '../schema';
import { eq, count, desc } from 'drizzle-orm';

export async function getAllDepartments(): Promise<(Department & { manager?: any; employee_count?: number })[]> {
  try {
    // Get all departments with manager info and employee count
    const results = await db.select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      description: departmentsTable.description,
      manager_id: departmentsTable.manager_id,
      created_at: departmentsTable.created_at,
      updated_at: departmentsTable.updated_at,
      manager_first_name: employeeProfilesTable.first_name,
      manager_last_name: employeeProfilesTable.last_name,
      manager_employee_id: employeeProfilesTable.employee_id,
    })
    .from(departmentsTable)
    .leftJoin(employeeProfilesTable, eq(departmentsTable.manager_id, employeeProfilesTable.id))
    .orderBy(desc(departmentsTable.created_at))
    .execute();

    // Get employee count for each department
    const departmentEmployeeCounts = await db.select({
      department: employeeProfilesTable.department,
      count: count(employeeProfilesTable.id)
    })
    .from(employeeProfilesTable)
    .groupBy(employeeProfilesTable.department)
    .execute();

    // Create a map for quick lookup of employee counts
    const employeeCountMap = new Map(
      departmentEmployeeCounts.map(item => [item.department, item.count])
    );

    return results.map(result => ({
      id: result.id,
      name: result.name,
      description: result.description,
      manager_id: result.manager_id,
      created_at: result.created_at,
      updated_at: result.updated_at,
      manager: result.manager_first_name ? {
        id: result.manager_id,
        first_name: result.manager_first_name,
        last_name: result.manager_last_name,
        employee_id: result.manager_employee_id
      } : undefined,
      employee_count: employeeCountMap.get(result.name) || 0
    }));
  } catch (error) {
    console.error('Failed to get all departments:', error);
    throw error;
  }
}

export async function getDepartmentById(id: number): Promise<(Department & { manager?: any; employees?: any[] }) | null> {
  try {
    // Get department with manager info
    const departmentResults = await db.select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      description: departmentsTable.description,
      manager_id: departmentsTable.manager_id,
      created_at: departmentsTable.created_at,
      updated_at: departmentsTable.updated_at,
      manager_first_name: employeeProfilesTable.first_name,
      manager_last_name: employeeProfilesTable.last_name,
      manager_employee_id: employeeProfilesTable.employee_id,
    })
    .from(departmentsTable)
    .leftJoin(employeeProfilesTable, eq(departmentsTable.manager_id, employeeProfilesTable.id))
    .where(eq(departmentsTable.id, id))
    .execute();

    if (departmentResults.length === 0) {
      return null;
    }

    const department = departmentResults[0];

    // Get all employees in this department
    const employees = await db.select({
      id: employeeProfilesTable.id,
      employee_id: employeeProfilesTable.employee_id,
      first_name: employeeProfilesTable.first_name,
      last_name: employeeProfilesTable.last_name,
      position: employeeProfilesTable.position,
      hire_date: employeeProfilesTable.hire_date,
      salary: employeeProfilesTable.salary,
      phone: employeeProfilesTable.phone,
      email: usersTable.email,
      role: usersTable.role,
      is_active: usersTable.is_active
    })
    .from(employeeProfilesTable)
    .innerJoin(usersTable, eq(employeeProfilesTable.user_id, usersTable.id))
    .where(eq(employeeProfilesTable.department, department.name))
    .orderBy(desc(employeeProfilesTable.created_at))
    .execute();

    return {
      id: department.id,
      name: department.name,
      description: department.description,
      manager_id: department.manager_id,
      created_at: department.created_at,
      updated_at: department.updated_at,
      manager: department.manager_first_name ? {
        id: department.manager_id,
        first_name: department.manager_first_name,
        last_name: department.manager_last_name,
        employee_id: department.manager_employee_id
      } : undefined,
      employees: employees.map(emp => ({
        ...emp,
        salary: emp.salary ? parseFloat(emp.salary) : null
      }))
    };
  } catch (error) {
    console.error('Failed to get department by id:', error);
    throw error;
  }
}

export async function createDepartment(input: { name: string; description?: string; manager_id?: number }): Promise<Department> {
  try {
    // Verify manager exists if provided
    if (input.manager_id) {
      const manager = await db.select({ id: employeeProfilesTable.id })
        .from(employeeProfilesTable)
        .where(eq(employeeProfilesTable.id, input.manager_id))
        .execute();
      
      if (manager.length === 0) {
        throw new Error('Manager not found');
      }
    }

    const result = await db.insert(departmentsTable)
      .values({
        name: input.name,
        description: input.description || null,
        manager_id: input.manager_id || null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Department creation failed:', error);
    throw error;
  }
}

export async function updateDepartment(id: number, input: { name?: string; description?: string; manager_id?: number }): Promise<Department> {
  try {
    // Check if department exists
    const existingDepartment = await db.select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, id))
      .execute();
    
    if (existingDepartment.length === 0) {
      throw new Error('Department not found');
    }

    // Verify manager exists if provided
    if (input.manager_id) {
      const manager = await db.select({ id: employeeProfilesTable.id })
        .from(employeeProfilesTable)
        .where(eq(employeeProfilesTable.id, input.manager_id))
        .execute();
      
      if (manager.length === 0) {
        throw new Error('Manager not found');
      }
    }

    // Build update values dynamically
    const updateValues: any = {
      updated_at: new Date()
    };

    if (input.name !== undefined) updateValues.name = input.name;
    if (input.description !== undefined) updateValues.description = input.description;
    if (input.manager_id !== undefined) updateValues.manager_id = input.manager_id;

    const result = await db.update(departmentsTable)
      .set(updateValues)
      .where(eq(departmentsTable.id, id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Department update failed:', error);
    throw error;
  }
}

export async function deleteDepartment(id: number): Promise<boolean> {
  try {
    // Check if department exists
    const existingDepartment = await db.select({ name: departmentsTable.name })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, id))
      .execute();
    
    if (existingDepartment.length === 0) {
      throw new Error('Department not found');
    }

    // Check if any employees are assigned to this department
    const employeesInDept = await db.select({ id: employeeProfilesTable.id })
      .from(employeeProfilesTable)
      .where(eq(employeeProfilesTable.department, existingDepartment[0].name))
      .execute();

    if (employeesInDept.length > 0) {
      throw new Error('Cannot delete department with assigned employees');
    }

    await db.delete(departmentsTable)
      .where(eq(departmentsTable.id, id))
      .execute();

    return true;
  } catch (error) {
    console.error('Department deletion failed:', error);
    throw error;
  }
}

export async function getDepartmentEmployees(departmentName: string): Promise<any[]> {
  try {
    const employees = await db.select({
      id: employeeProfilesTable.id,
      employee_id: employeeProfilesTable.employee_id,
      first_name: employeeProfilesTable.first_name,
      last_name: employeeProfilesTable.last_name,
      position: employeeProfilesTable.position,
      department: employeeProfilesTable.department,
      hire_date: employeeProfilesTable.hire_date,
      salary: employeeProfilesTable.salary,
      manager_id: employeeProfilesTable.manager_id,
      phone: employeeProfilesTable.phone,
      email: usersTable.email,
      role: usersTable.role,
      is_active: usersTable.is_active,
      created_at: employeeProfilesTable.created_at
    })
    .from(employeeProfilesTable)
    .innerJoin(usersTable, eq(employeeProfilesTable.user_id, usersTable.id))
    .where(eq(employeeProfilesTable.department, departmentName))
    .orderBy(desc(employeeProfilesTable.created_at))
    .execute();

    return employees.map(emp => ({
      ...emp,
      salary: emp.salary ? parseFloat(emp.salary) : null
    }));
  } catch (error) {
    console.error('Failed to get department employees:', error);
    throw error;
  }
}