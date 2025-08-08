import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, employeeProfilesTable, leaveRequestsTable } from '../db/schema';
import { type CreateLeaveRequestInput, type UpdateLeaveRequestStatusInput } from '../schema';
import {
  createLeaveRequest,
  getMyLeaveRequests,
  getPendingLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
  getTeamLeaveRequests,
  getAllLeaveRequests,
  getLeaveBalance
} from '../handlers/leave_requests';
import { eq } from 'drizzle-orm';

describe('Leave Request Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to get current year dates
  const getCurrentYearDate = (month: number, day: number) => {
    return new Date(new Date().getFullYear(), month, day);
  };

  // Helper function to create test data
  async function createTestData() {
    // Create users
    const userResults = await db.insert(usersTable)
      .values([
        {
          email: 'manager@test.com',
          password_hash: 'hashed_password',
          role: 'manager',
          is_active: true
        },
        {
          email: 'employee@test.com',
          password_hash: 'hashed_password',
          role: 'employee',
          is_active: true
        },
        {
          email: 'employee2@test.com',
          password_hash: 'hashed_password',
          role: 'employee',
          is_active: true
        }
      ])
      .returning()
      .execute();

    // Create employee profiles
    const employeeResults = await db.insert(employeeProfilesTable)
      .values([
        {
          user_id: userResults[0].id,
          employee_id: 'MGR001',
          first_name: 'Manager',
          last_name: 'User',
          department: 'IT',
          position: 'Manager',
          hire_date: '2023-01-01'
        },
        {
          user_id: userResults[1].id,
          employee_id: 'EMP001',
          first_name: 'John',
          last_name: 'Doe',
          department: 'IT',
          position: 'Developer',
          manager_id: null, // Will be set after manager is created
          hire_date: '2023-06-01'
        },
        {
          user_id: userResults[2].id,
          employee_id: 'EMP002',
          first_name: 'Jane',
          last_name: 'Smith',
          department: 'IT',
          position: 'Designer',
          manager_id: null, // Will be set after manager is created
          hire_date: '2023-07-01'
        }
      ])
      .returning()
      .execute();

    // Update employees to have manager
    const updatedEmployees = await Promise.all([
      db.update(employeeProfilesTable)
        .set({ manager_id: employeeResults[0].id })
        .where(eq(employeeProfilesTable.id, employeeResults[1].id))
        .returning()
        .execute(),
      db.update(employeeProfilesTable)
        .set({ manager_id: employeeResults[0].id })
        .where(eq(employeeProfilesTable.id, employeeResults[2].id))
        .returning()
        .execute()
    ]);

    return {
      manager: employeeResults[0],
      employee1: updatedEmployees[0][0],
      employee2: updatedEmployees[1][0]
    };
  }

  describe('createLeaveRequest', () => {
    it('should create a leave request successfully', async () => {
      const { employee1 } = await createTestData();
      
      const input: CreateLeaveRequestInput = {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      };

      const result = await createLeaveRequest(employee1.id, input);

      expect(result.employee_id).toEqual(employee1.id);
      expect(result.leave_type).toEqual('annual');
      expect(result.start_date).toEqual(getCurrentYearDate(2, 15));
      expect(result.end_date).toEqual(getCurrentYearDate(2, 19));
      expect(result.days_requested).toEqual(5); // 5 days inclusive
      expect(result.reason).toEqual('Family vacation');
      expect(result.status).toEqual('pending');
      expect(result.approved_by).toBeNull();
      expect(result.approved_at).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should calculate days correctly for single day', async () => {
      const { employee1 } = await createTestData();
      
      const input: CreateLeaveRequestInput = {
        leave_type: 'sick',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 15),   // March 15 (same day)
        reason: 'Medical appointment'
      };

      const result = await createLeaveRequest(employee1.id, input);

      expect(result.days_requested).toEqual(1);
    });

    it('should save leave request to database', async () => {
      const { employee1 } = await createTestData();
      
      const input: CreateLeaveRequestInput = {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      };

      const result = await createLeaveRequest(employee1.id, input);

      const savedRequest = await db.select()
        .from(leaveRequestsTable)
        .where(eq(leaveRequestsTable.id, result.id))
        .execute();

      expect(savedRequest).toHaveLength(1);
      expect(savedRequest[0].employee_id).toEqual(employee1.id);
      expect(savedRequest[0].leave_type).toEqual('annual');
      expect(savedRequest[0].status).toEqual('pending');
    });

    it('should throw error for non-existent employee', async () => {
      const input: CreateLeaveRequestInput = {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      };

      await expect(createLeaveRequest(999, input)).rejects.toThrow(/employee not found/i);
    });
  });

  describe('getMyLeaveRequests', () => {
    it('should return employee leave requests', async () => {
      const { employee1 } = await createTestData();
      
      // Create test leave request
      const input: CreateLeaveRequestInput = {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      };

      await createLeaveRequest(employee1.id, input);

      const results = await getMyLeaveRequests(employee1.id);

      expect(results).toHaveLength(1);
      expect(results[0].employee_id).toEqual(employee1.id);
      expect(results[0].leave_type).toEqual('annual');
      expect(results[0].reason).toEqual('Family vacation');
    });

    it('should return empty array for employee with no requests', async () => {
      const { employee1 } = await createTestData();

      const results = await getMyLeaveRequests(employee1.id);

      expect(results).toHaveLength(0);
    });

    it('should return requests ordered by most recent first', async () => {
      const { employee1 } = await createTestData();
      
      // Create multiple requests
      await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'First request'
      });

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      await createLeaveRequest(employee1.id, {
        leave_type: 'sick',
        start_date: getCurrentYearDate(3, 15), // April 15
        end_date: getCurrentYearDate(3, 16),   // April 16
        reason: 'Second request'
      });

      const results = await getMyLeaveRequests(employee1.id);

      expect(results).toHaveLength(2);
      expect(results[0].reason).toEqual('Second request'); // Most recent first
      expect(results[1].reason).toEqual('First request');
    });
  });

  describe('getPendingLeaveRequests', () => {
    it('should return all pending requests when no manager filter', async () => {
      const { employee1, employee2 } = await createTestData();
      
      // Create pending requests for both employees
      await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Employee 1 vacation'
      });

      await createLeaveRequest(employee2.id, {
        leave_type: 'sick',
        start_date: getCurrentYearDate(3, 15), // April 15
        end_date: getCurrentYearDate(3, 16),   // April 16
        reason: 'Employee 2 sick leave'
      });

      const results = await getPendingLeaveRequests();

      expect(results).toHaveLength(2);
      expect(results[0].employee.first_name).toBeDefined();
      expect(results[0].employee.last_name).toBeDefined();
      expect(results[0].status).toEqual('pending');
      expect(results[1].status).toEqual('pending');
    });

    it('should filter by manager team when managerId provided', async () => {
      const { manager, employee1, employee2 } = await createTestData();
      
      // Create requests for both employees (both under same manager)
      await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Employee 1 vacation'
      });

      await createLeaveRequest(employee2.id, {
        leave_type: 'sick',
        start_date: getCurrentYearDate(3, 15), // April 15
        end_date: getCurrentYearDate(3, 16),   // April 16
        reason: 'Employee 2 sick leave'
      });

      const results = await getPendingLeaveRequests(manager.id);

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.status).toEqual('pending');
        expect(result.employee).toBeDefined();
      });
    });

    it('should return empty array when manager has no team members', async () => {
      const { manager } = await createTestData();

      const results = await getPendingLeaveRequests(999); // Non-existent manager

      expect(results).toHaveLength(0);
    });
  });

  describe('approveLeaveRequest', () => {
    it('should approve leave request successfully', async () => {
      const { manager, employee1 } = await createTestData();
      
      // Create leave request
      const leaveRequest = await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      });

      const result = await approveLeaveRequest(leaveRequest.id, manager.id);

      expect(result.id).toEqual(leaveRequest.id);
      expect(result.status).toEqual('approved');
      expect(result.approved_by).toEqual(manager.id);
      expect(result.approved_at).toBeInstanceOf(Date);
      expect(result.rejection_reason).toBeNull();
    });

    it('should throw error for non-existent leave request', async () => {
      const { manager } = await createTestData();

      await expect(approveLeaveRequest(999, manager.id)).rejects.toThrow(/leave request not found/i);
    });

    it('should throw error for non-existent approver', async () => {
      const { employee1 } = await createTestData();
      
      const leaveRequest = await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      });

      await expect(approveLeaveRequest(leaveRequest.id, 999)).rejects.toThrow(/approver not found/i);
    });

    it('should throw error if request is not pending', async () => {
      const { manager, employee1 } = await createTestData();
      
      const leaveRequest = await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      });

      // Approve it first
      await approveLeaveRequest(leaveRequest.id, manager.id);

      // Try to approve again
      await expect(approveLeaveRequest(leaveRequest.id, manager.id))
        .rejects.toThrow(/leave request is not pending/i);
    });
  });

  describe('rejectLeaveRequest', () => {
    it('should reject leave request with reason', async () => {
      const { manager, employee1 } = await createTestData();
      
      const leaveRequest = await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      });

      const input: UpdateLeaveRequestStatusInput = {
        id: leaveRequest.id,
        status: 'rejected',
        rejection_reason: 'Too many employees on leave during this period'
      };

      const result = await rejectLeaveRequest(input, manager.id);

      expect(result.id).toEqual(leaveRequest.id);
      expect(result.status).toEqual('rejected');
      expect(result.approved_by).toEqual(manager.id);
      expect(result.approved_at).toBeInstanceOf(Date);
      expect(result.rejection_reason).toEqual('Too many employees on leave during this period');
    });

    it('should reject leave request without reason', async () => {
      const { manager, employee1 } = await createTestData();
      
      const leaveRequest = await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      });

      const input: UpdateLeaveRequestStatusInput = {
        id: leaveRequest.id,
        status: 'rejected'
      };

      const result = await rejectLeaveRequest(input, manager.id);

      expect(result.status).toEqual('rejected');
      expect(result.rejection_reason).toBeNull();
    });

    it('should throw error for non-existent leave request', async () => {
      const { manager } = await createTestData();

      const input: UpdateLeaveRequestStatusInput = {
        id: 999,
        status: 'rejected'
      };

      await expect(rejectLeaveRequest(input, manager.id)).rejects.toThrow(/leave request not found/i);
    });
  });

  describe('getTeamLeaveRequests', () => {
    it('should return all requests for team members', async () => {
      const { manager, employee1, employee2 } = await createTestData();
      
      await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Employee 1 vacation'
      });

      await createLeaveRequest(employee2.id, {
        leave_type: 'sick',
        start_date: getCurrentYearDate(3, 15), // April 15
        end_date: getCurrentYearDate(3, 16),   // April 16
        reason: 'Employee 2 sick leave'
      });

      const results = await getTeamLeaveRequests(manager.id);

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.employee).toBeDefined();
        expect(result.employee.first_name).toBeDefined();
      });
    });

    it('should return empty array for manager with no team', async () => {
      await createTestData();

      const results = await getTeamLeaveRequests(999);

      expect(results).toHaveLength(0);
    });
  });

  describe('getAllLeaveRequests', () => {
    it('should return all leave requests in organization', async () => {
      const { employee1, employee2 } = await createTestData();
      
      await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Employee 1 vacation'
      });

      await createLeaveRequest(employee2.id, {
        leave_type: 'sick',
        start_date: getCurrentYearDate(3, 15), // April 15
        end_date: getCurrentYearDate(3, 16),   // April 16
        reason: 'Employee 2 sick leave'
      });

      const results = await getAllLeaveRequests();

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.employee).toBeDefined();
        expect(result.employee.first_name).toBeDefined();
        expect(result.employee.employee_id).toBeDefined();
      });
    });

    it('should return empty array when no requests exist', async () => {
      await createTestData();

      const results = await getAllLeaveRequests();

      expect(results).toHaveLength(0);
    });
  });

  describe('getLeaveBalance', () => {
    it('should calculate leave balance correctly', async () => {
      const { employee1 } = await createTestData();

      const result = await getLeaveBalance(employee1.id);

      expect(result.annual).toEqual(25); // Full entitlement
      expect(result.sick).toEqual(15); // Full entitlement
      expect(result.total_used).toEqual(0);
    });

    it('should calculate balance after approved leave', async () => {
      const { manager, employee1 } = await createTestData();
      
      // Create and approve annual leave (5 days)
      const leaveRequest = await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      });

      await approveLeaveRequest(leaveRequest.id, manager.id);

      // Create and approve sick leave (2 days)
      const sickLeave = await createLeaveRequest(employee1.id, {
        leave_type: 'sick',
        start_date: getCurrentYearDate(3, 15), // April 15
        end_date: getCurrentYearDate(3, 16),   // April 16
        reason: 'Medical appointment'
      });

      await approveLeaveRequest(sickLeave.id, manager.id);

      const result = await getLeaveBalance(employee1.id);

      expect(result.annual).toEqual(20); // 25 - 5 days used
      expect(result.sick).toEqual(13); // 15 - 2 days used
      expect(result.total_used).toEqual(7); // 5 + 2 days total
    });

    it('should not count pending or rejected leave', async () => {
      const { manager, employee1 } = await createTestData();
      
      // Create pending leave
      await createLeaveRequest(employee1.id, {
        leave_type: 'annual',
        start_date: getCurrentYearDate(2, 15), // March 15
        end_date: getCurrentYearDate(2, 19),   // March 19
        reason: 'Family vacation'
      });

      // Create and reject leave
      const leaveToReject = await createLeaveRequest(employee1.id, {
        leave_type: 'sick',
        start_date: getCurrentYearDate(3, 15), // April 15
        end_date: getCurrentYearDate(3, 16),   // April 16
        reason: 'Medical appointment'
      });

      await rejectLeaveRequest({
        id: leaveToReject.id,
        status: 'rejected',
        rejection_reason: 'Not enough notice'
      }, manager.id);

      const result = await getLeaveBalance(employee1.id);

      expect(result.annual).toEqual(25); // Full entitlement
      expect(result.sick).toEqual(15); // Full entitlement
      expect(result.total_used).toEqual(0); // Nothing counted
    });

    it('should throw error for non-existent employee', async () => {
      await expect(getLeaveBalance(999)).rejects.toThrow(/employee not found/i);
    });
  });
});