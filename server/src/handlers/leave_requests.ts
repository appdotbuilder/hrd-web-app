import { db } from '../db';
import { leaveRequestsTable, employeeProfilesTable } from '../db/schema';
import { type CreateLeaveRequestInput, type UpdateLeaveRequestStatusInput, type LeaveRequest } from '../schema';
import { eq, and, gte, lte, desc, SQL } from 'drizzle-orm';

export async function createLeaveRequest(employeeId: number, input: CreateLeaveRequestInput): Promise<LeaveRequest> {
  try {
    // Validate that employee exists
    const employee = await db.select()
      .from(employeeProfilesTable)
      .where(eq(employeeProfilesTable.id, employeeId))
      .limit(1)
      .execute();
    
    if (employee.length === 0) {
      throw new Error('Employee not found');
    }

    // Calculate days requested (inclusive of start and end dates)
    const daysDiff = Math.ceil((input.end_date.getTime() - input.start_date.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    const result = await db.insert(leaveRequestsTable)
      .values({
        employee_id: employeeId,
        leave_type: input.leave_type,
        start_date: input.start_date.toISOString().split('T')[0], // Convert to date string
        end_date: input.end_date.toISOString().split('T')[0], // Convert to date string
        days_requested: daysDiff,
        reason: input.reason,
        status: 'pending'
      })
      .returning()
      .execute();

    const leaveRequest = result[0];
    return {
      ...leaveRequest,
      start_date: new Date(leaveRequest.start_date),
      end_date: new Date(leaveRequest.end_date),
      approved_at: leaveRequest.approved_at ? new Date(leaveRequest.approved_at) : null,
      created_at: new Date(leaveRequest.created_at),
      updated_at: new Date(leaveRequest.updated_at)
    };
  } catch (error) {
    console.error('Leave request creation failed:', error);
    throw error;
  }
}

export async function getMyLeaveRequests(employeeId: number): Promise<LeaveRequest[]> {
  try {
    const results = await db.select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.employee_id, employeeId))
      .orderBy(desc(leaveRequestsTable.created_at))
      .execute();

    return results.map(request => ({
      ...request,
      start_date: new Date(request.start_date),
      end_date: new Date(request.end_date),
      approved_at: request.approved_at ? new Date(request.approved_at) : null,
      created_at: new Date(request.created_at),
      updated_at: new Date(request.updated_at)
    }));
  } catch (error) {
    console.error('Failed to fetch leave requests:', error);
    throw error;
  }
}

export async function getPendingLeaveRequests(managerId?: number): Promise<(LeaveRequest & { employee: any })[]> {
  try {
    const conditions: SQL<unknown>[] = [eq(leaveRequestsTable.status, 'pending')];

    // If managerId is provided, filter by team members
    if (managerId !== undefined) {
      conditions.push(eq(employeeProfilesTable.manager_id, managerId));
    }

    // Build the complete query in one chain to maintain proper types
    const results = await db.select()
      .from(leaveRequestsTable)
      .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(leaveRequestsTable.created_at))
      .execute();

    return results.map(result => ({
      id: result.leave_requests.id,
      employee_id: result.leave_requests.employee_id,
      leave_type: result.leave_requests.leave_type,
      start_date: new Date(result.leave_requests.start_date),
      end_date: new Date(result.leave_requests.end_date),
      days_requested: result.leave_requests.days_requested,
      reason: result.leave_requests.reason,
      status: result.leave_requests.status,
      approved_by: result.leave_requests.approved_by,
      approved_at: result.leave_requests.approved_at ? new Date(result.leave_requests.approved_at) : null,
      rejection_reason: result.leave_requests.rejection_reason,
      created_at: new Date(result.leave_requests.created_at),
      updated_at: new Date(result.leave_requests.updated_at),
      employee: {
        id: result.employee_profiles.id,
        first_name: result.employee_profiles.first_name,
        last_name: result.employee_profiles.last_name,
        employee_id: result.employee_profiles.employee_id,
        department: result.employee_profiles.department,
        position: result.employee_profiles.position
      }
    }));
  } catch (error) {
    console.error('Failed to fetch pending leave requests:', error);
    throw error;
  }
}

export async function approveLeaveRequest(requestId: number, approverId: number): Promise<LeaveRequest> {
  try {
    // Verify the leave request exists and is pending
    const existingRequest = await db.select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.id, requestId))
      .limit(1)
      .execute();

    if (existingRequest.length === 0) {
      throw new Error('Leave request not found');
    }

    if (existingRequest[0].status !== 'pending') {
      throw new Error('Leave request is not pending');
    }

    // Verify approver exists
    const approver = await db.select()
      .from(employeeProfilesTable)
      .where(eq(employeeProfilesTable.id, approverId))
      .limit(1)
      .execute();
    
    if (approver.length === 0) {
      throw new Error('Approver not found');
    }

    const result = await db.update(leaveRequestsTable)
      .set({
        status: 'approved',
        approved_by: approverId,
        approved_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(leaveRequestsTable.id, requestId))
      .returning()
      .execute();

    const leaveRequest = result[0];
    return {
      ...leaveRequest,
      start_date: new Date(leaveRequest.start_date),
      end_date: new Date(leaveRequest.end_date),
      approved_at: leaveRequest.approved_at ? new Date(leaveRequest.approved_at) : null,
      created_at: new Date(leaveRequest.created_at),
      updated_at: new Date(leaveRequest.updated_at)
    };
  } catch (error) {
    console.error('Leave request approval failed:', error);
    throw error;
  }
}

export async function rejectLeaveRequest(input: UpdateLeaveRequestStatusInput, approverId: number): Promise<LeaveRequest> {
  try {
    // Verify the leave request exists and is pending
    const existingRequest = await db.select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.id, input.id))
      .limit(1)
      .execute();

    if (existingRequest.length === 0) {
      throw new Error('Leave request not found');
    }

    if (existingRequest[0].status !== 'pending') {
      throw new Error('Leave request is not pending');
    }

    // Verify approver exists
    const approver = await db.select()
      .from(employeeProfilesTable)
      .where(eq(employeeProfilesTable.id, approverId))
      .limit(1)
      .execute();
    
    if (approver.length === 0) {
      throw new Error('Approver not found');
    }

    const result = await db.update(leaveRequestsTable)
      .set({
        status: 'rejected',
        approved_by: approverId,
        approved_at: new Date(),
        rejection_reason: input.rejection_reason || null,
        updated_at: new Date()
      })
      .where(eq(leaveRequestsTable.id, input.id))
      .returning()
      .execute();

    const leaveRequest = result[0];
    return {
      ...leaveRequest,
      start_date: new Date(leaveRequest.start_date),
      end_date: new Date(leaveRequest.end_date),
      approved_at: leaveRequest.approved_at ? new Date(leaveRequest.approved_at) : null,
      created_at: new Date(leaveRequest.created_at),
      updated_at: new Date(leaveRequest.updated_at)
    };
  } catch (error) {
    console.error('Leave request rejection failed:', error);
    throw error;
  }
}

export async function getTeamLeaveRequests(managerId: number): Promise<(LeaveRequest & { employee: any })[]> {
  try {
    const results = await db.select()
      .from(leaveRequestsTable)
      .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
      .where(eq(employeeProfilesTable.manager_id, managerId))
      .orderBy(desc(leaveRequestsTable.created_at))
      .execute();

    return results.map(result => ({
      id: result.leave_requests.id,
      employee_id: result.leave_requests.employee_id,
      leave_type: result.leave_requests.leave_type,
      start_date: new Date(result.leave_requests.start_date),
      end_date: new Date(result.leave_requests.end_date),
      days_requested: result.leave_requests.days_requested,
      reason: result.leave_requests.reason,
      status: result.leave_requests.status,
      approved_by: result.leave_requests.approved_by,
      approved_at: result.leave_requests.approved_at ? new Date(result.leave_requests.approved_at) : null,
      rejection_reason: result.leave_requests.rejection_reason,
      created_at: new Date(result.leave_requests.created_at),
      updated_at: new Date(result.leave_requests.updated_at),
      employee: {
        id: result.employee_profiles.id,
        first_name: result.employee_profiles.first_name,
        last_name: result.employee_profiles.last_name,
        employee_id: result.employee_profiles.employee_id,
        department: result.employee_profiles.department,
        position: result.employee_profiles.position
      }
    }));
  } catch (error) {
    console.error('Failed to fetch team leave requests:', error);
    throw error;
  }
}

export async function getAllLeaveRequests(): Promise<(LeaveRequest & { employee: any })[]> {
  try {
    const results = await db.select()
      .from(leaveRequestsTable)
      .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
      .orderBy(desc(leaveRequestsTable.created_at))
      .execute();

    return results.map(result => ({
      id: result.leave_requests.id,
      employee_id: result.leave_requests.employee_id,
      leave_type: result.leave_requests.leave_type,
      start_date: new Date(result.leave_requests.start_date),
      end_date: new Date(result.leave_requests.end_date),
      days_requested: result.leave_requests.days_requested,
      reason: result.leave_requests.reason,
      status: result.leave_requests.status,
      approved_by: result.leave_requests.approved_by,
      approved_at: result.leave_requests.approved_at ? new Date(result.leave_requests.approved_at) : null,
      rejection_reason: result.leave_requests.rejection_reason,
      created_at: new Date(result.leave_requests.created_at),
      updated_at: new Date(result.leave_requests.updated_at),
      employee: {
        id: result.employee_profiles.id,
        first_name: result.employee_profiles.first_name,
        last_name: result.employee_profiles.last_name,
        employee_id: result.employee_profiles.employee_id,
        department: result.employee_profiles.department,
        position: result.employee_profiles.position
      }
    }));
  } catch (error) {
    console.error('Failed to fetch all leave requests:', error);
    throw error;
  }
}

export async function getLeaveBalance(employeeId: number): Promise<{ annual: number; sick: number; total_used: number }> {
  try {
    // Verify employee exists
    const employee = await db.select()
      .from(employeeProfilesTable)
      .where(eq(employeeProfilesTable.id, employeeId))
      .limit(1)
      .execute();
    
    if (employee.length === 0) {
      throw new Error('Employee not found');
    }

    // Get current year's approved leave requests
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);

    const approvedLeave = await db.select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.employee_id, employeeId),
          eq(leaveRequestsTable.status, 'approved'),
          gte(leaveRequestsTable.start_date, yearStart.toISOString().split('T')[0]),
          lte(leaveRequestsTable.end_date, yearEnd.toISOString().split('T')[0])
        )
      )
      .execute();

    // Calculate used days by leave type
    let annualUsed = 0;
    let sickUsed = 0;
    let totalUsed = 0;

    approvedLeave.forEach(leave => {
      totalUsed += leave.days_requested;
      if (leave.leave_type === 'annual') {
        annualUsed += leave.days_requested;
      } else if (leave.leave_type === 'sick') {
        sickUsed += leave.days_requested;
      }
    });

    // Company policy: 25 annual days, 15 sick days per year
    const ANNUAL_ENTITLEMENT = 25;
    const SICK_ENTITLEMENT = 15;

    return {
      annual: ANNUAL_ENTITLEMENT - annualUsed,
      sick: SICK_ENTITLEMENT - sickUsed,
      total_used: totalUsed
    };
  } catch (error) {
    console.error('Failed to fetch leave balance:', error);
    throw error;
  }
}