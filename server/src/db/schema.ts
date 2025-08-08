import { serial, text, pgTable, timestamp, numeric, integer, boolean, pgEnum, date, foreignKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Define enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'hr_manager', 'manager', 'employee']);
export const attendanceStatusEnum = pgEnum('attendance_status', ['present', 'absent', 'late', 'early_leave']);
export const leaveStatusEnum = pgEnum('leave_status', ['pending', 'approved', 'rejected']);
export const leaveTypeEnum = pgEnum('leave_type', ['annual', 'sick', 'maternity', 'paternity', 'emergency']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('employee'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Employee profiles table
export const employeeProfilesTable = pgTable('employee_profiles', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  employee_id: text('employee_id').notNull().unique(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  phone: text('phone'),
  department: text('department'),
  position: text('position'),
  hire_date: date('hire_date'),
  salary: numeric('salary', { precision: 12, scale: 2 }),
  manager_id: integer('manager_id'),
  profile_picture: text('profile_picture'),
  address: text('address'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  managerReference: foreignKey({
    columns: [table.manager_id],
    foreignColumns: [table.id],
    name: 'employee_profiles_manager_fkey'
  })
}));

// Attendance table
export const attendanceTable = pgTable('attendance', {
  id: serial('id').primaryKey(),
  employee_id: integer('employee_id').notNull().references(() => employeeProfilesTable.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  check_in_time: timestamp('check_in_time'),
  check_out_time: timestamp('check_out_time'),
  check_in_location: text('check_in_location'), // GPS coordinates as JSON string
  check_out_location: text('check_out_location'), // GPS coordinates as JSON string
  status: attendanceStatusEnum('status').notNull().default('absent'),
  work_hours: numeric('work_hours', { precision: 4, scale: 2 }),
  overtime_hours: numeric('overtime_hours', { precision: 4, scale: 2 }),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Leave requests table
export const leaveRequestsTable = pgTable('leave_requests', {
  id: serial('id').primaryKey(),
  employee_id: integer('employee_id').notNull().references(() => employeeProfilesTable.id, { onDelete: 'cascade' }),
  leave_type: leaveTypeEnum('leave_type').notNull(),
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  days_requested: integer('days_requested').notNull(),
  reason: text('reason').notNull(),
  status: leaveStatusEnum('status').notNull().default('pending'),
  approved_by: integer('approved_by').references(() => employeeProfilesTable.id),
  approved_at: timestamp('approved_at'),
  rejection_reason: text('rejection_reason'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Departments table
export const departmentsTable = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  manager_id: integer('manager_id').references(() => employeeProfilesTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Define relations
export const usersRelations = relations(usersTable, ({ one }) => ({
  profile: one(employeeProfilesTable, {
    fields: [usersTable.id],
    references: [employeeProfilesTable.user_id],
  }),
}));

export const employeeProfilesRelations = relations(employeeProfilesTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [employeeProfilesTable.user_id],
    references: [usersTable.id],
  }),
  manager: one(employeeProfilesTable, {
    fields: [employeeProfilesTable.manager_id],
    references: [employeeProfilesTable.id],
    relationName: 'manager',
  }),
  subordinates: many(employeeProfilesTable, {
    relationName: 'manager',
  }),
  attendance: many(attendanceTable),
  leaveRequests: many(leaveRequestsTable, {
    relationName: 'employee_leave_requests',
  }),
  approvedLeaveRequests: many(leaveRequestsTable, {
    relationName: 'approved_leave_requests',
  }),
}));

export const attendanceRelations = relations(attendanceTable, ({ one }) => ({
  employee: one(employeeProfilesTable, {
    fields: [attendanceTable.employee_id],
    references: [employeeProfilesTable.id],
  }),
}));

export const leaveRequestsRelations = relations(leaveRequestsTable, ({ one }) => ({
  employee: one(employeeProfilesTable, {
    fields: [leaveRequestsTable.employee_id],
    references: [employeeProfilesTable.id],
    relationName: 'employee_leave_requests',
  }),
  approver: one(employeeProfilesTable, {
    fields: [leaveRequestsTable.approved_by],
    references: [employeeProfilesTable.id],
    relationName: 'approved_leave_requests',
  }),
}));

export const departmentsRelations = relations(departmentsTable, ({ one }) => ({
  manager: one(employeeProfilesTable, {
    fields: [departmentsTable.manager_id],
    references: [employeeProfilesTable.id],
  }),
}));

// TypeScript types for table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type EmployeeProfile = typeof employeeProfilesTable.$inferSelect;
export type NewEmployeeProfile = typeof employeeProfilesTable.$inferInsert;

export type Attendance = typeof attendanceTable.$inferSelect;
export type NewAttendance = typeof attendanceTable.$inferInsert;

export type LeaveRequest = typeof leaveRequestsTable.$inferSelect;
export type NewLeaveRequest = typeof leaveRequestsTable.$inferInsert;

export type Department = typeof departmentsTable.$inferSelect;
export type NewDepartment = typeof departmentsTable.$inferInsert;

// Export all tables for proper query building
export const tables = {
  users: usersTable,
  employeeProfiles: employeeProfilesTable,
  attendance: attendanceTable,
  leaveRequests: leaveRequestsTable,
  departments: departmentsTable,
};