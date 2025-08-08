import { z } from 'zod';

// Enum schemas
export const userRoleSchema = z.enum(['admin', 'hr_manager', 'manager', 'employee']);
export const attendanceStatusSchema = z.enum(['present', 'absent', 'late', 'early_leave']);
export const leaveStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export const leaveTypeSchema = z.enum(['annual', 'sick', 'maternity', 'paternity', 'emergency']);

export type UserRole = z.infer<typeof userRoleSchema>;
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;
export type LeaveStatus = z.infer<typeof leaveStatusSchema>;
export type LeaveType = z.infer<typeof leaveTypeSchema>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password_hash: z.string(),
  role: userRoleSchema,
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Employee profile schema
export const employeeProfileSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  employee_id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string().nullable(),
  department: z.string().nullable(),
  position: z.string().nullable(),
  hire_date: z.coerce.date().nullable(),
  salary: z.number().nullable(),
  manager_id: z.number().nullable(),
  profile_picture: z.string().nullable(),
  address: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type EmployeeProfile = z.infer<typeof employeeProfileSchema>;

// Attendance schema
export const attendanceSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  date: z.coerce.date(),
  check_in_time: z.coerce.date().nullable(),
  check_out_time: z.coerce.date().nullable(),
  check_in_location: z.string().nullable(), // GPS coordinates as string
  check_out_location: z.string().nullable(),
  status: attendanceStatusSchema,
  work_hours: z.number().nullable(), // Calculated hours worked
  overtime_hours: z.number().nullable(),
  notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Attendance = z.infer<typeof attendanceSchema>;

// Leave request schema
export const leaveRequestSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  leave_type: leaveTypeSchema,
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  days_requested: z.number().int(),
  reason: z.string(),
  status: leaveStatusSchema,
  approved_by: z.number().nullable(),
  approved_at: z.coerce.date().nullable(),
  rejection_reason: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type LeaveRequest = z.infer<typeof leaveRequestSchema>;

// Department schema
export const departmentSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  manager_id: z.number().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Department = z.infer<typeof departmentSchema>;

// Authentication input schemas
export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: userRoleSchema,
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  employee_id: z.string().min(1),
  department: z.string().optional(),
  position: z.string().optional(),
  phone: z.string().optional()
});

export type RegisterInput = z.infer<typeof registerInputSchema>;

// User management input schemas
export const createUserInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: userRoleSchema,
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  employee_id: z.string().min(1),
  department: z.string().optional(),
  position: z.string().optional(),
  phone: z.string().optional(),
  hire_date: z.coerce.date().optional(),
  salary: z.number().positive().optional(),
  manager_id: z.number().optional()
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  role: userRoleSchema.optional(),
  is_active: z.boolean().optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  salary: z.number().positive().nullable().optional(),
  manager_id: z.number().nullable().optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// Attendance input schemas
export const checkInInputSchema = z.object({
  location: z.string() // GPS coordinates
});

export type CheckInInput = z.infer<typeof checkInInputSchema>;

export const checkOutInputSchema = z.object({
  location: z.string(), // GPS coordinates
  notes: z.string().optional()
});

export type CheckOutInput = z.infer<typeof checkOutInputSchema>;

export const getAttendanceInputSchema = z.object({
  employee_id: z.number().optional(), // For managers to view others' attendance
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional()
});

export type GetAttendanceInput = z.infer<typeof getAttendanceInputSchema>;

// Leave request input schemas
export const createLeaveRequestInputSchema = z.object({
  leave_type: leaveTypeSchema,
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  reason: z.string().min(1)
});

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestInputSchema>;

export const updateLeaveRequestStatusInputSchema = z.object({
  id: z.number(),
  status: leaveStatusSchema,
  rejection_reason: z.string().optional()
});

export type UpdateLeaveRequestStatusInput = z.infer<typeof updateLeaveRequestStatusInputSchema>;

// Dashboard statistics schema
export const dashboardStatsSchema = z.object({
  total_employees: z.number(),
  present_today: z.number(),
  absent_today: z.number(),
  late_today: z.number(),
  pending_leave_requests: z.number(),
  total_departments: z.number(),
  average_work_hours: z.number()
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// Recent activity schema
export const recentActivitySchema = z.object({
  id: z.number(),
  employee_name: z.string(),
  activity_type: z.enum(['check_in', 'check_out', 'leave_request', 'leave_approved', 'leave_rejected']),
  description: z.string(),
  timestamp: z.coerce.date()
});

export type RecentActivity = z.infer<typeof recentActivitySchema>;