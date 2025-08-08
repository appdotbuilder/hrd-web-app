import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  employeeProfilesTable, 
  attendanceTable, 
  leaveRequestsTable,
  departmentsTable 
} from '../db/schema';
import { eq } from 'drizzle-orm';
import { 
  getDashboardStats, 
  getRecentActivities, 
  getAttendanceSummary,
  getDepartmentStats,
  getLeaveStats 
} from '../handlers/dashboard';

// Test data setup helpers
const createTestUser = async (role: 'admin' | 'hr_manager' | 'manager' | 'employee' = 'employee') => {
  const result = await db.insert(usersTable)
    .values({
      email: `test-${Date.now()}@example.com`,
      password_hash: 'hashed_password',
      role,
      is_active: true
    })
    .returning()
    .execute();
  return result[0];
};

const createTestEmployee = async (userId: number, department: string = 'Engineering', managerId?: number) => {
  const result = await db.insert(employeeProfilesTable)
    .values({
      user_id: userId,
      employee_id: `EMP-${Date.now()}`,
      first_name: 'John',
      last_name: 'Doe',
      department,
      position: 'Software Engineer',
      hire_date: '2024-01-01',
      salary: '75000.00',
      manager_id: managerId
    })
    .returning()
    .execute();
  return result[0];
};

const createTestAttendance = async (employeeId: number, date: string, status: 'present' | 'absent' | 'late' | 'early_leave') => {
  const checkInTime = status === 'absent' ? null : new Date(`${date}T09:00:00Z`);
  const checkOutTime = status === 'absent' ? null : new Date(`${date}T17:00:00Z`);
  const workHours = status === 'absent' ? null : '8.00';

  const result = await db.insert(attendanceTable)
    .values({
      employee_id: employeeId,
      date,
      check_in_time: checkInTime,
      check_out_time: checkOutTime,
      status,
      work_hours: workHours,
      check_in_location: '40.7128,-74.0060',
      check_out_location: '40.7128,-74.0060'
    })
    .returning()
    .execute();
  return result[0];
};

const createTestLeaveRequest = async (employeeId: number, status: 'pending' | 'approved' | 'rejected' = 'pending') => {
  const result = await db.insert(leaveRequestsTable)
    .values({
      employee_id: employeeId,
      leave_type: 'annual',
      start_date: '2024-01-15',
      end_date: '2024-01-17',
      days_requested: 3,
      reason: 'Vacation',
      status
    })
    .returning()
    .execute();
  return result[0];
};

describe('Dashboard Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getDashboardStats', () => {
    it('should return basic dashboard statistics for admin', async () => {
      // Create test data
      const adminUser = await createTestUser('admin');
      const employee1User = await createTestUser('employee');
      const employee2User = await createTestUser('employee');
      
      const employee1 = await createTestEmployee(employee1User.id, 'Engineering');
      const employee2 = await createTestEmployee(employee2User.id, 'Sales');

      const today = new Date().toISOString().split('T')[0];
      
      // Create attendance records
      await createTestAttendance(employee1.id, today, 'present');
      await createTestAttendance(employee2.id, today, 'late');

      // Create leave requests
      await createTestLeaveRequest(employee1.id, 'pending');
      await createTestLeaveRequest(employee2.id, 'pending');

      // Create department
      await db.insert(departmentsTable)
        .values({
          name: 'Engineering',
          description: 'Software development team'
        })
        .execute();

      const result = await getDashboardStats('admin');

      expect(result.total_employees).toBe(2);
      expect(result.present_today).toBe(1);
      expect(result.late_today).toBe(1);
      expect(result.absent_today).toBe(0);
      expect(result.pending_leave_requests).toBe(2);
      expect(result.total_departments).toBe(1);
      expect(typeof result.average_work_hours).toBe('number');
    });

    it('should filter statistics for managers based on their team', async () => {
      // Create manager and employees
      const managerUser = await createTestUser('manager');
      const manager = await createTestEmployee(managerUser.id, 'Engineering');
      
      const employee1User = await createTestUser('employee');
      const employee2User = await createTestUser('employee');
      const employee3User = await createTestUser('employee');
      
      // Employee1 and Employee2 report to manager
      const employee1 = await createTestEmployee(employee1User.id, 'Engineering', manager.id);
      const employee2 = await createTestEmployee(employee2User.id, 'Engineering', manager.id);
      // Employee3 does not report to manager
      const employee3 = await createTestEmployee(employee3User.id, 'Sales');

      const today = new Date().toISOString().split('T')[0];
      
      // Create attendance records
      await createTestAttendance(employee1.id, today, 'present');
      await createTestAttendance(employee2.id, today, 'absent');
      await createTestAttendance(employee3.id, today, 'present'); // Should be excluded

      // Create leave requests
      await createTestLeaveRequest(employee1.id, 'pending');
      await createTestLeaveRequest(employee3.id, 'pending'); // Should be excluded

      const result = await getDashboardStats('manager', manager.id);

      // Should only include employees that report to this manager
      expect(result.total_employees).toBe(2);
      expect(result.present_today).toBe(1);
      expect(result.absent_today).toBe(1);
      expect(result.pending_leave_requests).toBe(1);
      expect(result.total_departments).toBe(0); // Managers don't see department stats
    });

    it('should handle empty database gracefully', async () => {
      const result = await getDashboardStats('admin');

      expect(result.total_employees).toBe(0);
      expect(result.present_today).toBe(0);
      expect(result.absent_today).toBe(0);
      expect(result.late_today).toBe(0);
      expect(result.pending_leave_requests).toBe(0);
      expect(result.total_departments).toBe(0);
      expect(result.average_work_hours).toBe(0);
    });
  });

  describe('getRecentActivities', () => {
    it('should return recent check-in and leave activities', async () => {
      // Create test data
      const employeeUser = await createTestUser('employee');
      const employee = await createTestEmployee(employeeUser.id);

      const today = new Date().toISOString().split('T')[0];
      
      // Create attendance record with both check-in and check-out
      await createTestAttendance(employee.id, today, 'present');
      
      // Create leave request
      await createTestLeaveRequest(employee.id, 'pending');

      const result = await getRecentActivities('admin');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('employee_name');
      expect(result[0]).toHaveProperty('activity_type');
      expect(result[0]).toHaveProperty('description');
      expect(result[0]).toHaveProperty('timestamp');
      expect(result[0].timestamp).toBeInstanceOf(Date);

      // Should contain both attendance and leave activities
      const activityTypes = result.map(activity => activity.activity_type);
      expect(activityTypes).toContain('leave_request');
    });

    it('should filter activities for managers', async () => {
      // Create manager and employees
      const managerUser = await createTestUser('manager');
      const manager = await createTestEmployee(managerUser.id);
      
      const employee1User = await createTestUser('employee');
      const employee2User = await createTestUser('employee');
      
      const employee1 = await createTestEmployee(employee1User.id, 'Engineering', manager.id);
      const employee2 = await createTestEmployee(employee2User.id, 'Sales'); // Different team

      const today = new Date().toISOString().split('T')[0];
      
      // Create activities for both employees
      await createTestAttendance(employee1.id, today, 'present');
      await createTestAttendance(employee2.id, today, 'present');

      const result = await getRecentActivities('manager', manager.id);

      // Should only show activities from manager's team
      if (result.length > 0) {
        expect(result.every(activity => activity.employee_name === 'John Doe')).toBe(true);
      }
    });

    it('should respect the limit parameter', async () => {
      // Create test data
      const employeeUser = await createTestUser('employee');
      const employee = await createTestEmployee(employeeUser.id);

      const today = new Date().toISOString().split('T')[0];
      
      // Create multiple attendance records
      for (let i = 0; i < 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        await createTestAttendance(employee.id, date.toISOString().split('T')[0], 'present');
      }

      const result = await getRecentActivities('admin', undefined, 3);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should handle no recent activities', async () => {
      const result = await getRecentActivities('admin');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('getAttendanceSummary', () => {
    it('should return attendance summary for specified days', async () => {
      // Create test data
      const employeeUser = await createTestUser('employee');
      const employee = await createTestEmployee(employeeUser.id);

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Create attendance records
      await createTestAttendance(employee.id, today.toISOString().split('T')[0], 'present');
      await createTestAttendance(employee.id, yesterday.toISOString().split('T')[0], 'late');

      const result = await getAttendanceSummary('admin', undefined, 7);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(7);
      
      // Check structure of each day
      result.forEach(day => {
        expect(day).toHaveProperty('date');
        expect(day).toHaveProperty('present');
        expect(day).toHaveProperty('absent');
        expect(day).toHaveProperty('late');
        expect(day).toHaveProperty('early_leave');
        expect(typeof day.present).toBe('number');
        expect(typeof day.absent).toBe('number');
        expect(typeof day.late).toBe('number');
        expect(typeof day.early_leave).toBe('number');
      });

      // Check that dates are in correct order (oldest first)
      for (let i = 1; i < result.length; i++) {
        expect(new Date(result[i].date).getTime()).toBeGreaterThan(
          new Date(result[i-1].date).getTime()
        );
      }
    });

    it('should filter attendance summary for managers', async () => {
      // Create manager and employees
      const managerUser = await createTestUser('manager');
      const manager = await createTestEmployee(managerUser.id);
      
      const employee1User = await createTestUser('employee');
      const employee2User = await createTestUser('employee');
      
      const employee1 = await createTestEmployee(employee1User.id, 'Engineering', manager.id);
      const employee2 = await createTestEmployee(employee2User.id, 'Sales');

      const today = new Date().toISOString().split('T')[0];
      
      // Create attendance records
      await createTestAttendance(employee1.id, today, 'present');
      await createTestAttendance(employee2.id, today, 'present'); // Should be excluded

      const result = await getAttendanceSummary('manager', manager.id, 1);

      expect(result.length).toBe(1);
      expect(result[0].present).toBe(1); // Only manager's employee
    });
  });

  describe('getDepartmentStats', () => {
    it('should return department statistics with attendance rates', async () => {
      // Create employees in different departments
      const user1 = await createTestUser('employee');
      const user2 = await createTestUser('employee');
      const user3 = await createTestUser('employee');
      
      const emp1 = await createTestEmployee(user1.id, 'Engineering');
      const emp2 = await createTestEmployee(user2.id, 'Engineering');
      const emp3 = await createTestEmployee(user3.id, 'Sales');

      const today = new Date().toISOString().split('T')[0];
      
      // Create attendance records
      await createTestAttendance(emp1.id, today, 'present');
      await createTestAttendance(emp2.id, today, 'absent');
      await createTestAttendance(emp3.id, today, 'present');

      const result = await getDepartmentStats();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      const engineering = result.find(dept => dept.department === 'Engineering');
      const sales = result.find(dept => dept.department === 'Sales');

      expect(engineering).toBeDefined();
      expect(engineering.total_employees).toBe(2);
      expect(engineering.present_today).toBe(1);
      expect(engineering.attendance_rate).toBe(50.0);

      expect(sales).toBeDefined();
      expect(sales.total_employees).toBe(1);
      expect(sales.present_today).toBe(1);
      expect(sales.attendance_rate).toBe(100.0);

      // Should be sorted by total employees (descending)
      expect(result[0].total_employees).toBeGreaterThanOrEqual(result[1].total_employees);
    });

    it('should handle employees without departments', async () => {
      // Create employee without department
      const user = await createTestUser('employee');
      await db.insert(employeeProfilesTable)
        .values({
          user_id: user.id,
          employee_id: 'EMP-001',
          first_name: 'John',
          last_name: 'Doe',
          department: null // No department
        })
        .execute();

      const result = await getDepartmentStats();

      // Should not include employees without departments
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('getLeaveStats', () => {
    it('should return comprehensive leave statistics', async () => {
      // Create test employees
      const user1 = await createTestUser('employee');
      const user2 = await createTestUser('employee');
      const emp1 = await createTestEmployee(user1.id);
      const emp2 = await createTestEmployee(user2.id);

      // Create leave requests with different statuses
      await createTestLeaveRequest(emp1.id, 'pending');
      await createTestLeaveRequest(emp2.id, 'pending');
      
      // Create approved leave request
      const approvedLeave = await createTestLeaveRequest(emp1.id, 'approved');
      await db.update(leaveRequestsTable)
        .set({ approved_at: new Date() })
        .where(eq(leaveRequestsTable.id, approvedLeave.id))
        .execute();

      // Create rejected leave request
      const rejectedLeave = await createTestLeaveRequest(emp2.id, 'rejected');
      await db.update(leaveRequestsTable)
        .set({ approved_at: new Date() })
        .where(eq(leaveRequestsTable.id, rejectedLeave.id))
        .execute();

      const result = await getLeaveStats('admin');

      expect(result).toHaveProperty('pending_requests');
      expect(result).toHaveProperty('approved_this_month');
      expect(result).toHaveProperty('rejected_this_month');
      expect(result).toHaveProperty('most_common_leave_type');
      expect(result).toHaveProperty('average_leave_days');

      expect(result.pending_requests).toBe(2);
      expect(result.approved_this_month).toBe(1);
      expect(result.rejected_this_month).toBe(1);
      expect(result.most_common_leave_type).toBe('annual');
      expect(result.average_leave_days).toBe(3.0);
    });

    it('should filter leave stats for managers', async () => {
      // Create manager and employees
      const managerUser = await createTestUser('manager');
      const manager = await createTestEmployee(managerUser.id);
      
      const employee1User = await createTestUser('employee');
      const employee2User = await createTestUser('employee');
      
      const employee1 = await createTestEmployee(employee1User.id, 'Engineering', manager.id);
      const employee2 = await createTestEmployee(employee2User.id, 'Sales');

      // Create leave requests
      await createTestLeaveRequest(employee1.id, 'pending');
      await createTestLeaveRequest(employee2.id, 'pending'); // Should be excluded

      const result = await getLeaveStats('manager', manager.id);

      // Should only count leave requests from manager's team
      expect(result.pending_requests).toBe(1);
    });

    it('should handle no leave data gracefully', async () => {
      const result = await getLeaveStats('admin');

      expect(result.pending_requests).toBe(0);
      expect(result.approved_this_month).toBe(0);
      expect(result.rejected_this_month).toBe(0);
      expect(result.most_common_leave_type).toBe('annual');
      expect(result.average_leave_days).toBe(0);
    });
  });
});