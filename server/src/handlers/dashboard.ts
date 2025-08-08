import { db } from '../db';
import { 
  employeeProfilesTable, 
  attendanceTable, 
  leaveRequestsTable, 
  departmentsTable,
  usersTable 
} from '../db/schema';
import { type DashboardStats, type RecentActivity } from '../schema';
import { eq, count, and, gte, lte, isNull, desc, sql, SQL } from 'drizzle-orm';

export async function getDashboardStats(userRole: string, employeeId?: number): Promise<DashboardStats> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];

    // Get total employees
    const totalEmployeesResult = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({ count: count() })
          .from(employeeProfilesTable)
          .where(eq(employeeProfilesTable.manager_id, employeeId))
          .execute();
      } else {
        return db.select({ count: count() })
          .from(employeeProfilesTable)
          .execute();
      }
    })();
    const totalEmployees = totalEmployeesResult[0]?.count || 0;

    // Get today's attendance stats
    const attendanceStats = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({ 
          status: attendanceTable.status,
          count: count()
        })
        .from(attendanceTable)
        .innerJoin(employeeProfilesTable, eq(attendanceTable.employee_id, employeeProfilesTable.id))
        .where(and(
          eq(attendanceTable.date, todayString),
          eq(employeeProfilesTable.manager_id, employeeId)
        ))
        .groupBy(attendanceTable.status)
        .execute();
      } else {
        return db.select({ 
          status: attendanceTable.status,
          count: count()
        })
        .from(attendanceTable)
        .innerJoin(employeeProfilesTable, eq(attendanceTable.employee_id, employeeProfilesTable.id))
        .where(eq(attendanceTable.date, todayString))
        .groupBy(attendanceTable.status)
        .execute();
      }
    })();
    
    const presentToday = attendanceStats.find(s => s.status === 'present')?.count || 0;
    const lateToday = attendanceStats.find(s => s.status === 'late')?.count || 0;
    const absentToday = totalEmployees - presentToday - lateToday;

    // Get pending leave requests
    const pendingLeaveResult = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({ count: count() })
          .from(leaveRequestsTable)
          .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
          .where(and(
            eq(leaveRequestsTable.status, 'pending'),
            eq(employeeProfilesTable.manager_id, employeeId)
          ))
          .execute();
      } else {
        return db.select({ count: count() })
          .from(leaveRequestsTable)
          .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
          .where(eq(leaveRequestsTable.status, 'pending'))
          .execute();
      }
    })();
    const pendingLeaveRequests = pendingLeaveResult[0]?.count || 0;

    // Get total departments (only for admin/hr_manager)
    let totalDepartments = 0;
    if (userRole === 'admin' || userRole === 'hr_manager') {
      const departmentResult = await db.select({ count: count() })
        .from(departmentsTable)
        .execute();
      totalDepartments = departmentResult[0]?.count || 0;
    }

    // Calculate average work hours for the past week
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoString = oneWeekAgo.toISOString().split('T')[0];

    const workHoursResult = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({ 
          work_hours: attendanceTable.work_hours
        })
        .from(attendanceTable)
        .innerJoin(employeeProfilesTable, eq(attendanceTable.employee_id, employeeProfilesTable.id))
        .where(and(
          gte(attendanceTable.date, oneWeekAgoString),
          lte(attendanceTable.date, todayString),
          eq(employeeProfilesTable.manager_id, employeeId)
        ))
        .execute();
      } else {
        return db.select({ 
          work_hours: attendanceTable.work_hours
        })
        .from(attendanceTable)
        .innerJoin(employeeProfilesTable, eq(attendanceTable.employee_id, employeeProfilesTable.id))
        .where(and(
          gte(attendanceTable.date, oneWeekAgoString),
          lte(attendanceTable.date, todayString)
        ))
        .execute();
      }
    })();

    const validWorkHours = workHoursResult
      .filter(record => record.work_hours !== null)
      .map(record => parseFloat(record.work_hours!));

    const averageWorkHours = validWorkHours.length > 0
      ? validWorkHours.reduce((sum, hours) => sum + hours, 0) / validWorkHours.length
      : 0;

    return {
      total_employees: totalEmployees,
      present_today: presentToday,
      absent_today: absentToday,
      late_today: lateToday,
      pending_leave_requests: pendingLeaveRequests,
      total_departments: totalDepartments,
      average_work_hours: Math.round(averageWorkHours * 10) / 10 // Round to 1 decimal place
    };

  } catch (error) {
    console.error('Dashboard stats query failed:', error);
    throw error;
  }
}

export async function getRecentActivities(userRole: string, employeeId?: number, limit: number = 10): Promise<RecentActivity[]> {
  try {
    const activities: RecentActivity[] = [];

    // Get recent attendance activities (check-ins and check-outs)
    const attendanceResults = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({
          id: attendanceTable.id,
          employee_name: sql<string>`CONCAT(${employeeProfilesTable.first_name}, ' ', ${employeeProfilesTable.last_name})`,
          check_in_time: attendanceTable.check_in_time,
          check_out_time: attendanceTable.check_out_time,
          created_at: attendanceTable.created_at
        })
        .from(attendanceTable)
        .innerJoin(employeeProfilesTable, eq(attendanceTable.employee_id, employeeProfilesTable.id))
        .where(and(
          gte(attendanceTable.created_at, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          eq(employeeProfilesTable.manager_id, employeeId)
        ))
        .orderBy(desc(attendanceTable.created_at))
        .limit(limit)
        .execute();
      } else {
        return db.select({
          id: attendanceTable.id,
          employee_name: sql<string>`CONCAT(${employeeProfilesTable.first_name}, ' ', ${employeeProfilesTable.last_name})`,
          check_in_time: attendanceTable.check_in_time,
          check_out_time: attendanceTable.check_out_time,
          created_at: attendanceTable.created_at
        })
        .from(attendanceTable)
        .innerJoin(employeeProfilesTable, eq(attendanceTable.employee_id, employeeProfilesTable.id))
        .where(gte(attendanceTable.created_at, new Date(Date.now() - 24 * 60 * 60 * 1000)))
        .orderBy(desc(attendanceTable.created_at))
        .limit(limit)
        .execute();
      }
    })();

    // Process attendance results
    for (const record of attendanceResults) {
      if (record.check_in_time) {
        activities.push({
          id: record.id * 1000, // Unique ID for check-in
          employee_name: record.employee_name,
          activity_type: 'check_in',
          description: `Checked in at ${record.check_in_time.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}`,
          timestamp: record.check_in_time
        });
      }

      if (record.check_out_time) {
        activities.push({
          id: record.id * 1000 + 1, // Unique ID for check-out
          employee_name: record.employee_name,
          activity_type: 'check_out',
          description: `Checked out at ${record.check_out_time.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}`,
          timestamp: record.check_out_time
        });
      }
    }

    // Get recent leave request activities
    const leaveResults = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({
          id: leaveRequestsTable.id,
          employee_name: sql<string>`CONCAT(${employeeProfilesTable.first_name}, ' ', ${employeeProfilesTable.last_name})`,
          leave_type: leaveRequestsTable.leave_type,
          status: leaveRequestsTable.status,
          days_requested: leaveRequestsTable.days_requested,
          created_at: leaveRequestsTable.created_at,
          approved_at: leaveRequestsTable.approved_at
        })
        .from(leaveRequestsTable)
        .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
        .where(and(
          gte(leaveRequestsTable.created_at, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
          eq(employeeProfilesTable.manager_id, employeeId)
        ))
        .orderBy(desc(leaveRequestsTable.created_at))
        .limit(limit)
        .execute();
      } else {
        return db.select({
          id: leaveRequestsTable.id,
          employee_name: sql<string>`CONCAT(${employeeProfilesTable.first_name}, ' ', ${employeeProfilesTable.last_name})`,
          leave_type: leaveRequestsTable.leave_type,
          status: leaveRequestsTable.status,
          days_requested: leaveRequestsTable.days_requested,
          created_at: leaveRequestsTable.created_at,
          approved_at: leaveRequestsTable.approved_at
        })
        .from(leaveRequestsTable)
        .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
        .where(gte(leaveRequestsTable.created_at, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
        .orderBy(desc(leaveRequestsTable.created_at))
        .limit(limit)
        .execute();
      }
    })();

    // Process leave results
    for (const record of leaveResults) {
      // Leave request creation
      activities.push({
        id: record.id * 10000, // Unique ID for leave request
        employee_name: record.employee_name,
        activity_type: 'leave_request',
        description: `Requested ${record.days_requested} days ${record.leave_type} leave`,
        timestamp: record.created_at
      });

      // Leave approval/rejection
      if (record.status === 'approved' && record.approved_at) {
        activities.push({
          id: record.id * 10000 + 1, // Unique ID for approval
          employee_name: record.employee_name,
          activity_type: 'leave_approved',
          description: `${record.leave_type} leave request approved`,
          timestamp: record.approved_at
        });
      } else if (record.status === 'rejected' && record.approved_at) {
        activities.push({
          id: record.id * 10000 + 2, // Unique ID for rejection
          employee_name: record.employee_name,
          activity_type: 'leave_rejected',
          description: `${record.leave_type} leave request rejected`,
          timestamp: record.approved_at
        });
      }
    }

    // Sort all activities by timestamp (newest first) and limit
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

  } catch (error) {
    console.error('Recent activities query failed:', error);
    throw error;
  }
}

export async function getAttendanceSummary(userRole: string, employeeId?: number, days: number = 7): Promise<any[]> {
  try {
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);

    const summary = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0];

      const dayStats = await (async () => {
        if (userRole === 'manager' && employeeId) {
          return db.select({
            status: attendanceTable.status,
            count: count()
          })
          .from(attendanceTable)
          .innerJoin(employeeProfilesTable, eq(attendanceTable.employee_id, employeeProfilesTable.id))
          .where(and(
            eq(attendanceTable.date, dateString),
            eq(employeeProfilesTable.manager_id, employeeId)
          ))
          .groupBy(attendanceTable.status)
          .execute();
        } else {
          return db.select({
            status: attendanceTable.status,
            count: count()
          })
          .from(attendanceTable)
          .innerJoin(employeeProfilesTable, eq(attendanceTable.employee_id, employeeProfilesTable.id))
          .where(eq(attendanceTable.date, dateString))
          .groupBy(attendanceTable.status)
          .execute();
        }
      })();

      const present = dayStats.find(s => s.status === 'present')?.count || 0;
      const absent = dayStats.find(s => s.status === 'absent')?.count || 0;
      const late = dayStats.find(s => s.status === 'late')?.count || 0;
      const earlyLeave = dayStats.find(s => s.status === 'early_leave')?.count || 0;

      summary.push({
        date: dateString,
        present: present,
        absent: absent,
        late: late,
        early_leave: earlyLeave
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return summary;

  } catch (error) {
    console.error('Attendance summary query failed:', error);
    throw error;
  }
}

export async function getDepartmentStats(): Promise<any[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString().split('T')[0];

    // Get all departments with employee counts
    const departmentStats = await db.select({
      department: employeeProfilesTable.department,
      total_employees: count()
    })
    .from(employeeProfilesTable)
    .where(sql`${employeeProfilesTable.department} IS NOT NULL`)
    .groupBy(employeeProfilesTable.department)
    .execute();

    const results = [];

    for (const dept of departmentStats) {
      // Get today's attendance for this department
      const attendanceStats = await db.select({
        status: attendanceTable.status,
        count: count()
      })
      .from(attendanceTable)
      .innerJoin(employeeProfilesTable, eq(attendanceTable.employee_id, employeeProfilesTable.id))
      .where(
        and(
          eq(attendanceTable.date, todayString),
          eq(employeeProfilesTable.department, dept.department!)
        )
      )
      .groupBy(attendanceTable.status)
      .execute();

      const presentToday = attendanceStats.find(s => s.status === 'present')?.count || 0;
      const lateToday = attendanceStats.find(s => s.status === 'late')?.count || 0;
      const totalPresent = presentToday + lateToday;
      
      const attendanceRate = dept.total_employees > 0 
        ? Math.round((totalPresent / dept.total_employees) * 100 * 10) / 10
        : 0;

      results.push({
        department: dept.department,
        total_employees: dept.total_employees,
        present_today: totalPresent,
        attendance_rate: attendanceRate
      });
    }

    return results.sort((a, b) => b.total_employees - a.total_employees);

  } catch (error) {
    console.error('Department stats query failed:', error);
    throw error;
  }
}

export async function getLeaveStats(userRole: string, employeeId?: number): Promise<any> {
  try {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Get pending requests
    const pendingResult = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({ count: count() })
          .from(leaveRequestsTable)
          .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
          .where(and(
            eq(leaveRequestsTable.status, 'pending'),
            eq(employeeProfilesTable.manager_id, employeeId)
          ))
          .execute();
      } else {
        return db.select({ count: count() })
          .from(leaveRequestsTable)
          .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
          .where(eq(leaveRequestsTable.status, 'pending'))
          .execute();
      }
    })();
    const pendingRequests = pendingResult[0]?.count || 0;

    // Get this month's approved requests
    const approvedResult = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({ count: count() })
          .from(leaveRequestsTable)
          .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
          .where(and(
            eq(leaveRequestsTable.status, 'approved'),
            gte(leaveRequestsTable.approved_at, currentMonth),
            lte(leaveRequestsTable.approved_at, nextMonth),
            eq(employeeProfilesTable.manager_id, employeeId)
          ))
          .execute();
      } else {
        return db.select({ count: count() })
          .from(leaveRequestsTable)
          .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
          .where(and(
            eq(leaveRequestsTable.status, 'approved'),
            gte(leaveRequestsTable.approved_at, currentMonth),
            lte(leaveRequestsTable.approved_at, nextMonth)
          ))
          .execute();
      }
    })();
    const approvedThisMonth = approvedResult[0]?.count || 0;

    // Get this month's rejected requests
    const rejectedResult = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({ count: count() })
          .from(leaveRequestsTable)
          .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
          .where(and(
            eq(leaveRequestsTable.status, 'rejected'),
            gte(leaveRequestsTable.approved_at, currentMonth),
            lte(leaveRequestsTable.approved_at, nextMonth),
            eq(employeeProfilesTable.manager_id, employeeId)
          ))
          .execute();
      } else {
        return db.select({ count: count() })
          .from(leaveRequestsTable)
          .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
          .where(and(
            eq(leaveRequestsTable.status, 'rejected'),
            gte(leaveRequestsTable.approved_at, currentMonth),
            lte(leaveRequestsTable.approved_at, nextMonth)
          ))
          .execute();
      }
    })();
    const rejectedThisMonth = rejectedResult[0]?.count || 0;

    // Get most common leave type
    const leaveTypeResult = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({
          leave_type: leaveRequestsTable.leave_type,
          count: count()
        })
        .from(leaveRequestsTable)
        .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
        .where(eq(employeeProfilesTable.manager_id, employeeId))
        .groupBy(leaveRequestsTable.leave_type)
        .orderBy(desc(count()))
        .execute();
      } else {
        return db.select({
          leave_type: leaveRequestsTable.leave_type,
          count: count()
        })
        .from(leaveRequestsTable)
        .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
        .groupBy(leaveRequestsTable.leave_type)
        .orderBy(desc(count()))
        .execute();
      }
    })();
    const mostCommonLeaveType = leaveTypeResult[0]?.leave_type || 'annual';

    // Calculate average leave days
    const avgDaysResult = await (async () => {
      if (userRole === 'manager' && employeeId) {
        return db.select({
          days_requested: leaveRequestsTable.days_requested
        })
        .from(leaveRequestsTable)
        .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
        .where(and(
          eq(leaveRequestsTable.status, 'approved'),
          eq(employeeProfilesTable.manager_id, employeeId)
        ))
        .execute();
      } else {
        return db.select({
          days_requested: leaveRequestsTable.days_requested
        })
        .from(leaveRequestsTable)
        .innerJoin(employeeProfilesTable, eq(leaveRequestsTable.employee_id, employeeProfilesTable.id))
        .where(eq(leaveRequestsTable.status, 'approved'))
        .execute();
      }
    })();

    const totalDays = avgDaysResult.reduce((sum, record) => sum + record.days_requested, 0);
    const averageLeaveDays = avgDaysResult.length > 0 
      ? Math.round((totalDays / avgDaysResult.length) * 10) / 10
      : 0;

    return {
      pending_requests: pendingRequests,
      approved_this_month: approvedThisMonth,
      rejected_this_month: rejectedThisMonth,
      most_common_leave_type: mostCommonLeaveType,
      average_leave_days: averageLeaveDays
    };

  } catch (error) {
    console.error('Leave stats query failed:', error);
    throw error;
  }
}