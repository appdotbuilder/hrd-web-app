import { db } from '../db';
import { usersTable, employeeProfilesTable } from '../db/schema';
import { type LoginInput, type RegisterInput, type User, type EmployeeProfile } from '../schema';
import { eq } from 'drizzle-orm';

// Simple password hashing for demo purposes - in production use bcrypt
const hashPassword = (password: string): string => {
  return Buffer.from(password).toString('base64') + '_hashed';
};

const verifyPassword = (password: string, hash: string): boolean => {
  return hashPassword(password) === hash;
};

// Simple token generation for demo purposes - in production use JWT
const generateToken = (userId: number): string => {
  const payload = JSON.stringify({ userId, timestamp: Date.now() });
  return Buffer.from(payload).toString('base64');
};

export async function login(input: LoginInput): Promise<{ user: User; token: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      throw new Error('Account is inactive');
    }

    // Verify password
    if (!verifyPassword(input.password, user.password_hash)) {
      throw new Error('Invalid credentials');
    }

    // Generate token
    const token = generateToken(user.id);

    return {
      user: {
        ...user,
        created_at: new Date(user.created_at),
        updated_at: new Date(user.updated_at)
      },
      token
    };
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

export async function register(input: RegisterInput): Promise<{ user: User; profile: EmployeeProfile }> {
  try {
    // Check if email already exists
    const existingUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (existingUsers.length > 0) {
      throw new Error('Email already registered');
    }

    // Check if employee_id already exists
    const existingProfiles = await db.select()
      .from(employeeProfilesTable)
      .where(eq(employeeProfilesTable.employee_id, input.employee_id))
      .execute();

    if (existingProfiles.length > 0) {
      throw new Error('Employee ID already exists');
    }

    // Hash password
    const password_hash = hashPassword(input.password);

    // Create user
    const userResult = await db.insert(usersTable)
      .values({
        email: input.email,
        password_hash,
        role: input.role,
        is_active: true
      })
      .returning()
      .execute();

    const user = userResult[0];

    // Create employee profile - only using fields available in RegisterInput
    const profileResult = await db.insert(employeeProfilesTable)
      .values({
        user_id: user.id,
        employee_id: input.employee_id,
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone || null,
        department: input.department || null,
        position: input.position || null,
        hire_date: null, // Not available in RegisterInput
        salary: null, // Not available in RegisterInput
        manager_id: null // Not available in RegisterInput
      })
      .returning()
      .execute();

    const profile = profileResult[0];

    return {
      user: {
        ...user,
        created_at: new Date(user.created_at),
        updated_at: new Date(user.updated_at)
      },
      profile: {
        ...profile,
        salary: profile.salary ? parseFloat(profile.salary) : null, // Convert string back to number
        hire_date: profile.hire_date ? new Date(profile.hire_date) : null,
        created_at: new Date(profile.created_at),
        updated_at: new Date(profile.updated_at)
      }
    };
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
}

export async function getCurrentUser(userId: number): Promise<User & { profile: EmployeeProfile }> {
  try {
    // Get user with profile using join
    const results = await db.select()
      .from(usersTable)
      .innerJoin(employeeProfilesTable, eq(usersTable.id, employeeProfilesTable.user_id))
      .where(eq(usersTable.id, userId))
      .execute();

    if (results.length === 0) {
      throw new Error('User not found');
    }

    const result = results[0];
    const user = result.users;
    const profile = result.employee_profiles;

    return {
      ...user,
      created_at: new Date(user.created_at),
      updated_at: new Date(user.updated_at),
      profile: {
        ...profile,
        salary: profile.salary ? parseFloat(profile.salary) : null, // Convert string back to number
        hire_date: profile.hire_date ? new Date(profile.hire_date) : null,
        created_at: new Date(profile.created_at),
        updated_at: new Date(profile.updated_at)
      }
    };
  } catch (error) {
    console.error('Get current user failed:', error);
    throw error;
  }
}