import { db } from '../db';
import { usersTable, employeeProfilesTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput, type User, type EmployeeProfile } from '../schema';
import { eq, and, SQL } from 'drizzle-orm';

// Simple password hashing function for demo purposes
// In production, use a proper hashing library like bcrypt
function hashPassword(password: string): string {
  // This is a simple hash for demo - use bcrypt in production
  return `hashed_${password}_${Date.now()}`;
}

export async function getAllUsers(): Promise<(User & { profile: EmployeeProfile })[]> {
  try {
    const results = await db.select()
      .from(usersTable)
      .innerJoin(employeeProfilesTable, eq(usersTable.id, employeeProfilesTable.user_id))
      .execute();

    return results.map(result => ({
      id: result.users.id,
      email: result.users.email,
      password_hash: result.users.password_hash,
      role: result.users.role,
      is_active: result.users.is_active,
      created_at: result.users.created_at,
      updated_at: result.users.updated_at,
      profile: {
        id: result.employee_profiles.id,
        user_id: result.employee_profiles.user_id,
        employee_id: result.employee_profiles.employee_id,
        first_name: result.employee_profiles.first_name,
        last_name: result.employee_profiles.last_name,
        phone: result.employee_profiles.phone,
        department: result.employee_profiles.department,
        position: result.employee_profiles.position,
        hire_date: result.employee_profiles.hire_date ? new Date(result.employee_profiles.hire_date) : null,
        salary: result.employee_profiles.salary ? parseFloat(result.employee_profiles.salary) : null,
        manager_id: result.employee_profiles.manager_id,
        profile_picture: result.employee_profiles.profile_picture,
        address: result.employee_profiles.address,
        created_at: result.employee_profiles.created_at,
        updated_at: result.employee_profiles.updated_at
      }
    }));
  } catch (error) {
    console.error('Failed to fetch all users:', error);
    throw error;
  }
}

export async function getUserById(id: number): Promise<(User & { profile: EmployeeProfile }) | null> {
  try {
    const results = await db.select()
      .from(usersTable)
      .innerJoin(employeeProfilesTable, eq(usersTable.id, employeeProfilesTable.user_id))
      .where(eq(usersTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    return {
      id: result.users.id,
      email: result.users.email,
      password_hash: result.users.password_hash,
      role: result.users.role,
      is_active: result.users.is_active,
      created_at: result.users.created_at,
      updated_at: result.users.updated_at,
      profile: {
        id: result.employee_profiles.id,
        user_id: result.employee_profiles.user_id,
        employee_id: result.employee_profiles.employee_id,
        first_name: result.employee_profiles.first_name,
        last_name: result.employee_profiles.last_name,
        phone: result.employee_profiles.phone,
        department: result.employee_profiles.department,
        position: result.employee_profiles.position,
        hire_date: result.employee_profiles.hire_date ? new Date(result.employee_profiles.hire_date) : null,
        salary: result.employee_profiles.salary ? parseFloat(result.employee_profiles.salary) : null,
        manager_id: result.employee_profiles.manager_id,
        profile_picture: result.employee_profiles.profile_picture,
        address: result.employee_profiles.address,
        created_at: result.employee_profiles.created_at,
        updated_at: result.employee_profiles.updated_at
      }
    };
  } catch (error) {
    console.error('Failed to fetch user by ID:', error);
    throw error;
  }
}

export async function createUser(input: CreateUserInput): Promise<User & { profile: EmployeeProfile }> {
  try {
    // Verify manager exists if manager_id is provided
    if (input.manager_id) {
      const manager = await db.select()
        .from(employeeProfilesTable)
        .where(eq(employeeProfilesTable.id, input.manager_id))
        .execute();
      
      if (manager.length === 0) {
        throw new Error('Manager not found');
      }
    }

    // Hash the password
    const password_hash = hashPassword(input.password);

    // Create user account
    const userResult = await db.insert(usersTable)
      .values({
        email: input.email,
        password_hash,
        role: input.role
      })
      .returning()
      .execute();

    const user = userResult[0];

    // Create employee profile
    const profileResult = await db.insert(employeeProfilesTable)
      .values({
        user_id: user.id,
        employee_id: input.employee_id,
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone || null,
        department: input.department || null,
        position: input.position || null,
        hire_date: input.hire_date ? input.hire_date.toISOString().split('T')[0] : null,
        salary: input.salary ? input.salary.toString() : null,
        manager_id: input.manager_id || null
      })
      .returning()
      .execute();

    const profile = profileResult[0];

    return {
      id: user.id,
      email: user.email,
      password_hash: user.password_hash,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
      profile: {
        id: profile.id,
        user_id: profile.user_id,
        employee_id: profile.employee_id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        department: profile.department,
        position: profile.position,
        hire_date: profile.hire_date ? new Date(profile.hire_date) : null,
        salary: profile.salary ? parseFloat(profile.salary) : null,
        manager_id: profile.manager_id,
        profile_picture: profile.profile_picture,
        address: profile.address,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      }
    };
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
}

export async function updateUser(input: UpdateUserInput): Promise<User & { profile: EmployeeProfile }> {
  try {
    // Verify user exists
    const existingUser = await getUserById(input.id);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Verify manager exists if manager_id is provided
    if (input.manager_id !== undefined && input.manager_id !== null) {
      const manager = await db.select()
        .from(employeeProfilesTable)
        .where(eq(employeeProfilesTable.id, input.manager_id))
        .execute();
      
      if (manager.length === 0) {
        throw new Error('Manager not found');
      }
    }

    // Update user table if relevant fields are provided
    const userUpdates: any = {};
    if (input.email !== undefined) userUpdates.email = input.email;
    if (input.role !== undefined) userUpdates.role = input.role;
    if (input.is_active !== undefined) userUpdates.is_active = input.is_active;
    
    if (Object.keys(userUpdates).length > 0) {
      userUpdates.updated_at = new Date();
      await db.update(usersTable)
        .set(userUpdates)
        .where(eq(usersTable.id, input.id))
        .execute();
    }

    // Update employee profile if relevant fields are provided
    const profileUpdates: any = {};
    if (input.first_name !== undefined) profileUpdates.first_name = input.first_name;
    if (input.last_name !== undefined) profileUpdates.last_name = input.last_name;
    if (input.phone !== undefined) profileUpdates.phone = input.phone;
    if (input.department !== undefined) profileUpdates.department = input.department;
    if (input.position !== undefined) profileUpdates.position = input.position;
    if (input.salary !== undefined) {
      profileUpdates.salary = input.salary !== null ? input.salary.toString() : null;
    }
    if (input.manager_id !== undefined) profileUpdates.manager_id = input.manager_id;

    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.updated_at = new Date();
      await db.update(employeeProfilesTable)
        .set(profileUpdates)
        .where(eq(employeeProfilesTable.user_id, input.id))
        .execute();
    }

    // Return updated user
    const updatedUser = await getUserById(input.id);
    if (!updatedUser) {
      throw new Error('Failed to fetch updated user');
    }

    return updatedUser;
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
}

export async function deleteUser(id: number): Promise<boolean> {
  try {
    // Check if user exists
    const user = await getUserById(id);
    if (!user) {
      return false;
    }

    // Deactivate user instead of deleting to preserve data integrity
    await db.update(usersTable)
      .set({ 
        is_active: false,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, id))
      .execute();

    return true;
  } catch (error) {
    console.error('User deletion failed:', error);
    throw error;
  }
}

export async function getUsersByRole(role: string): Promise<(User & { profile: EmployeeProfile })[]> {
  try {
    const results = await db.select()
      .from(usersTable)
      .innerJoin(employeeProfilesTable, eq(usersTable.id, employeeProfilesTable.user_id))
      .where(eq(usersTable.role, role as any))
      .execute();

    return results.map(result => ({
      id: result.users.id,
      email: result.users.email,
      password_hash: result.users.password_hash,
      role: result.users.role,
      is_active: result.users.is_active,
      created_at: result.users.created_at,
      updated_at: result.users.updated_at,
      profile: {
        id: result.employee_profiles.id,
        user_id: result.employee_profiles.user_id,
        employee_id: result.employee_profiles.employee_id,
        first_name: result.employee_profiles.first_name,
        last_name: result.employee_profiles.last_name,
        phone: result.employee_profiles.phone,
        department: result.employee_profiles.department,
        position: result.employee_profiles.position,
        hire_date: result.employee_profiles.hire_date ? new Date(result.employee_profiles.hire_date) : null,
        salary: result.employee_profiles.salary ? parseFloat(result.employee_profiles.salary) : null,
        manager_id: result.employee_profiles.manager_id,
        profile_picture: result.employee_profiles.profile_picture,
        address: result.employee_profiles.address,
        created_at: result.employee_profiles.created_at,
        updated_at: result.employee_profiles.updated_at
      }
    }));
  } catch (error) {
    console.error('Failed to fetch users by role:', error);
    throw error;
  }
}

export async function getUsersByDepartment(department: string): Promise<(User & { profile: EmployeeProfile })[]> {
  try {
    const results = await db.select()
      .from(usersTable)
      .innerJoin(employeeProfilesTable, eq(usersTable.id, employeeProfilesTable.user_id))
      .where(eq(employeeProfilesTable.department, department))
      .execute();

    return results.map(result => ({
      id: result.users.id,
      email: result.users.email,
      password_hash: result.users.password_hash,
      role: result.users.role,
      is_active: result.users.is_active,
      created_at: result.users.created_at,
      updated_at: result.users.updated_at,
      profile: {
        id: result.employee_profiles.id,
        user_id: result.employee_profiles.user_id,
        employee_id: result.employee_profiles.employee_id,
        first_name: result.employee_profiles.first_name,
        last_name: result.employee_profiles.last_name,
        phone: result.employee_profiles.phone,
        department: result.employee_profiles.department,
        position: result.employee_profiles.position,
        hire_date: result.employee_profiles.hire_date ? new Date(result.employee_profiles.hire_date) : null,
        salary: result.employee_profiles.salary ? parseFloat(result.employee_profiles.salary) : null,
        manager_id: result.employee_profiles.manager_id,
        profile_picture: result.employee_profiles.profile_picture,
        address: result.employee_profiles.address,
        created_at: result.employee_profiles.created_at,
        updated_at: result.employee_profiles.updated_at
      }
    }));
  } catch (error) {
    console.error('Failed to fetch users by department:', error);
    throw error;
  }
}