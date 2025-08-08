import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import all schemas
import {
  loginInputSchema,
  registerInputSchema,
  createUserInputSchema,
  updateUserInputSchema,
  checkInInputSchema,
  checkOutInputSchema,
  getAttendanceInputSchema,
  createLeaveRequestInputSchema,
  updateLeaveRequestStatusInputSchema,
  userRoleSchema
} from './schema';

// Import all handlers
import { login, register, getCurrentUser } from './handlers/auth';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUsersByRole,
  getUsersByDepartment
} from './handlers/user_management';
import {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory,
  getTeamAttendance,
  getAllAttendanceByDate,
  updateAttendanceStatus
} from './handlers/attendance';
import {
  createLeaveRequest,
  getMyLeaveRequests,
  getPendingLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
  getTeamLeaveRequests,
  getAllLeaveRequests,
  getLeaveBalance
} from './handlers/leave_requests';
import {
  getDashboardStats,
  getRecentActivities,
  getAttendanceSummary,
  getDepartmentStats,
  getLeaveStats
} from './handlers/dashboard';
import {
  getAllDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentEmployees
} from './handlers/departments';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => login(input)),
    
    register: publicProcedure
      .input(registerInputSchema)
      .mutation(({ input }) => register(input)),
    
    getCurrentUser: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getCurrentUser(input.userId)),
  }),

  // User management routes (Admin/HR only)
  users: router({
    getAll: publicProcedure
      .query(() => getAllUsers()),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getUserById(input.id)),
    
    create: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => createUser(input)),
    
    update: publicProcedure
      .input(updateUserInputSchema)
      .mutation(({ input }) => updateUser(input)),
    
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteUser(input.id)),
    
    getByRole: publicProcedure
      .input(z.object({ role: userRoleSchema }))
      .query(({ input }) => getUsersByRole(input.role)),
    
    getByDepartment: publicProcedure
      .input(z.object({ department: z.string() }))
      .query(({ input }) => getUsersByDepartment(input.department)),
  }),

  // Attendance routes
  attendance: router({
    checkIn: publicProcedure
      .input(z.object({ employeeId: z.number() }).merge(checkInInputSchema))
      .mutation(({ input }) => checkIn(input.employeeId, { location: input.location })),
    
    checkOut: publicProcedure
      .input(z.object({ employeeId: z.number() }).merge(checkOutInputSchema))
      .mutation(({ input }) => checkOut(input.employeeId, { location: input.location, notes: input.notes })),
    
    getTodayAttendance: publicProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(({ input }) => getTodayAttendance(input.employeeId)),
    
    getHistory: publicProcedure
      .input(z.object({ employeeId: z.number() }).merge(getAttendanceInputSchema))
      .query(({ input }) => getAttendanceHistory(input.employeeId, input)),
    
    getTeamAttendance: publicProcedure
      .input(z.object({ managerId: z.number(), date: z.coerce.date().optional() }))
      .query(({ input }) => getTeamAttendance(input.managerId, input.date)),
    
    getAllByDate: publicProcedure
      .input(z.object({ date: z.coerce.date() }))
      .query(({ input }) => getAllAttendanceByDate(input.date)),
    
    updateStatus: publicProcedure
      .input(z.object({ attendanceId: z.number(), status: z.string(), notes: z.string().optional() }))
      .mutation(({ input }) => updateAttendanceStatus(input.attendanceId, input.status, input.notes)),
  }),

  // Leave request routes
  leaves: router({
    create: publicProcedure
      .input(z.object({ employeeId: z.number() }).merge(createLeaveRequestInputSchema))
      .mutation(({ input }) => createLeaveRequest(input.employeeId, {
        leave_type: input.leave_type,
        start_date: input.start_date,
        end_date: input.end_date,
        reason: input.reason
      })),
    
    getMyRequests: publicProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(({ input }) => getMyLeaveRequests(input.employeeId)),
    
    getPending: publicProcedure
      .input(z.object({ managerId: z.number().optional() }))
      .query(({ input }) => getPendingLeaveRequests(input.managerId)),
    
    approve: publicProcedure
      .input(z.object({ requestId: z.number(), approverId: z.number() }))
      .mutation(({ input }) => approveLeaveRequest(input.requestId, input.approverId)),
    
    reject: publicProcedure
      .input(updateLeaveRequestStatusInputSchema.merge(z.object({ approverId: z.number() })))
      .mutation(({ input }) => rejectLeaveRequest({
        id: input.id,
        status: input.status,
        rejection_reason: input.rejection_reason
      }, input.approverId)),
    
    getTeamRequests: publicProcedure
      .input(z.object({ managerId: z.number() }))
      .query(({ input }) => getTeamLeaveRequests(input.managerId)),
    
    getAll: publicProcedure
      .query(() => getAllLeaveRequests()),
    
    getBalance: publicProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(({ input }) => getLeaveBalance(input.employeeId)),
  }),

  // Dashboard routes
  dashboard: router({
    getStats: publicProcedure
      .input(z.object({ userRole: z.string(), employeeId: z.number().optional() }))
      .query(({ input }) => getDashboardStats(input.userRole, input.employeeId)),
    
    getRecentActivities: publicProcedure
      .input(z.object({ userRole: z.string(), employeeId: z.number().optional(), limit: z.number().default(10) }))
      .query(({ input }) => getRecentActivities(input.userRole, input.employeeId, input.limit)),
    
    getAttendanceSummary: publicProcedure
      .input(z.object({ userRole: z.string(), employeeId: z.number().optional(), days: z.number().default(7) }))
      .query(({ input }) => getAttendanceSummary(input.userRole, input.employeeId, input.days)),
    
    getDepartmentStats: publicProcedure
      .query(() => getDepartmentStats()),
    
    getLeaveStats: publicProcedure
      .input(z.object({ userRole: z.string(), employeeId: z.number().optional() }))
      .query(({ input }) => getLeaveStats(input.userRole, input.employeeId)),
  }),

  // Department routes
  departments: router({
    getAll: publicProcedure
      .query(() => getAllDepartments()),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getDepartmentById(input.id)),
    
    create: publicProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        manager_id: z.number().optional()
      }))
      .mutation(({ input }) => createDepartment(input)),
    
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        manager_id: z.number().optional()
      }))
      .mutation(({ input }) => updateDepartment(input.id, {
        name: input.name,
        description: input.description,
        manager_id: input.manager_id
      })),
    
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteDepartment(input.id)),
    
    getEmployees: publicProcedure
      .input(z.object({ departmentName: z.string() }))
      .query(({ input }) => getDepartmentEmployees(input.departmentName)),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`HRM TRPC server listening at port: ${port}`);
}

start();