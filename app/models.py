from sqlmodel import SQLModel, Field, Relationship, JSON, Column
from datetime import datetime, date, time
from typing import Optional, List, Dict, Any
from decimal import Decimal
from enum import Enum


# Enums for better type safety
class UserRole(str, Enum):
    ADMIN = "admin"
    HR = "hr"
    MANAGER = "manager"
    EMPLOYEE = "employee"


class EmploymentStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    TERMINATED = "terminated"
    RESIGNED = "resigned"


class AttendanceStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    HALF_DAY = "half_day"


class LeaveStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class LeaveType(str, Enum):
    ANNUAL = "annual"
    SICK = "sick"
    MATERNITY = "maternity"
    PATERNITY = "paternity"
    EMERGENCY = "emergency"
    UNPAID = "unpaid"


class TrainingStatus(str, Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class DocumentType(str, Enum):
    CONTRACT = "contract"
    ID_CARD = "id_card"
    CV = "cv"
    CERTIFICATE = "certificate"
    PERFORMANCE_REVIEW = "performance_review"
    OTHER = "other"


class PayrollStatus(str, Enum):
    DRAFT = "draft"
    PROCESSED = "processed"
    PAID = "paid"


# 1. User Authentication and Roles
class HrdUser(SQLModel, table=True):
    __tablename__ = "hrd_users"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, max_length=255, regex=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
    password_hash: str = Field(max_length=255)
    role: UserRole = Field(default=UserRole.EMPLOYEE)
    is_active: bool = Field(default=True)
    last_login: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    employee: Optional["HrdEmployee"] = Relationship(back_populates="user")
    attendance_records: List["HrdAttendance"] = Relationship(back_populates="user")


# 2. Employee Master Data
class HrdEmployee(SQLModel, table=True):
    __tablename__ = "hrd_employees"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    employee_id: str = Field(unique=True, max_length=50)
    user_id: int = Field(foreign_key="hrd_users.id", unique=True)
    first_name: str = Field(max_length=100)
    last_name: str = Field(max_length=100)
    date_of_birth: date
    phone: str = Field(max_length=20)
    address: str = Field(max_length=500)
    emergency_contact_name: str = Field(max_length=100)
    emergency_contact_phone: str = Field(max_length=20)
    hire_date: date
    employment_status: EmploymentStatus = Field(default=EmploymentStatus.ACTIVE)
    department_id: Optional[int] = Field(default=None, foreign_key="hrd_departments.id")
    position_id: Optional[int] = Field(default=None, foreign_key="hrd_positions.id")
    manager_id: Optional[int] = Field(default=None, foreign_key="hrd_employees.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    user: HrdUser = Relationship(back_populates="employee")
    department: Optional["HrdDepartment"] = Relationship(back_populates="employees")
    position: Optional["HrdPosition"] = Relationship(back_populates="employees")
    manager: Optional["HrdEmployee"] = Relationship(
        back_populates="subordinates", sa_relationship_kwargs={"remote_side": "HrdEmployee.id"}
    )
    subordinates: List["HrdEmployee"] = Relationship(back_populates="manager")
    contracts: List["HrdContract"] = Relationship(back_populates="employee")
    leave_requests: List["HrdLeaveRequest"] = Relationship(back_populates="employee")
    training_enrollments: List["HrdTrainingEnrollment"] = Relationship(back_populates="employee")
    performance_reviews: List["HrdPerformanceReview"] = Relationship(back_populates="employee")
    documents: List["HrdDocument"] = Relationship(back_populates="employee")
    payroll_records: List["HrdPayroll"] = Relationship(back_populates="employee")


# 3. Departments
class HrdDepartment(SQLModel, table=True):
    __tablename__ = "hrd_departments"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    code: str = Field(unique=True, max_length=20)
    description: str = Field(default="", max_length=500)
    manager_id: Optional[int] = Field(default=None, foreign_key="hrd_employees.id")
    budget: Optional[Decimal] = Field(default=None, decimal_places=2)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    employees: List[HrdEmployee] = Relationship(back_populates="department")
    positions: List["HrdPosition"] = Relationship(back_populates="department")


# 4. Positions
class HrdPosition(SQLModel, table=True):
    __tablename__ = "hrd_positions"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=100)
    code: str = Field(unique=True, max_length=20)
    description: str = Field(default="", max_length=1000)
    department_id: int = Field(foreign_key="hrd_departments.id")
    level: str = Field(max_length=50)  # Entry, Mid, Senior, Executive
    min_salary: Optional[Decimal] = Field(default=None, decimal_places=2)
    max_salary: Optional[Decimal] = Field(default=None, decimal_places=2)
    requirements: str = Field(default="", max_length=2000)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    department: HrdDepartment = Relationship(back_populates="positions")
    employees: List[HrdEmployee] = Relationship(back_populates="position")


# 5. Employment Contracts
class HrdContract(SQLModel, table=True):
    __tablename__ = "hrd_contracts"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="hrd_employees.id")
    contract_type: str = Field(max_length=50)  # Permanent, Contract, Temporary
    start_date: date
    end_date: Optional[date] = Field(default=None)
    base_salary: Decimal = Field(decimal_places=2)
    allowances: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    benefits: List[str] = Field(default=[], sa_column=Column(JSON))
    working_hours: int = Field(default=40)  # hours per week
    is_active: bool = Field(default=True)
    signed_date: Optional[date] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    employee: HrdEmployee = Relationship(back_populates="contracts")


# 6. Attendance Management
class HrdAttendance(SQLModel, table=True):
    __tablename__ = "hrd_attendance"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="hrd_users.id")
    date: date
    check_in_time: Optional[time] = Field(default=None)
    check_out_time: Optional[time] = Field(default=None)
    break_start_time: Optional[time] = Field(default=None)
    break_end_time: Optional[time] = Field(default=None)
    total_hours: Optional[Decimal] = Field(default=None, decimal_places=2)
    overtime_hours: Optional[Decimal] = Field(default=Decimal("0"), decimal_places=2)
    status: AttendanceStatus = Field(default=AttendanceStatus.ABSENT)
    check_in_location: Optional[str] = Field(default=None, max_length=255)  # GPS coordinates
    check_out_location: Optional[str] = Field(default=None, max_length=255)
    notes: str = Field(default="", max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    user: HrdUser = Relationship(back_populates="attendance_records")


# 7. Leave Management
class HrdLeaveRequest(SQLModel, table=True):
    __tablename__ = "hrd_leave_requests"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="hrd_employees.id")
    leave_type: LeaveType
    start_date: date
    end_date: date
    days_requested: int
    reason: str = Field(max_length=1000)
    status: LeaveStatus = Field(default=LeaveStatus.PENDING)
    approved_by: Optional[int] = Field(default=None, foreign_key="hrd_employees.id")
    approved_at: Optional[datetime] = Field(default=None)
    rejection_reason: str = Field(default="", max_length=500)
    supporting_documents: List[str] = Field(default=[], sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    employee: HrdEmployee = Relationship(back_populates="leave_requests")


# 8. Training Programs
class HrdTrainingProgram(SQLModel, table=True):
    __tablename__ = "hrd_training_programs"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=200)
    description: str = Field(max_length=2000)
    trainer: str = Field(max_length=200)
    duration_hours: int
    max_participants: Optional[int] = Field(default=None)
    cost_per_participant: Optional[Decimal] = Field(default=None, decimal_places=2)
    start_date: datetime
    end_date: datetime
    location: str = Field(max_length=255)
    status: TrainingStatus = Field(default=TrainingStatus.SCHEDULED)
    materials: List[str] = Field(default=[], sa_column=Column(JSON))
    prerequisites: str = Field(default="", max_length=1000)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    enrollments: List["HrdTrainingEnrollment"] = Relationship(back_populates="training_program")


# 9. Training Enrollments
class HrdTrainingEnrollment(SQLModel, table=True):
    __tablename__ = "hrd_training_enrollments"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="hrd_employees.id")
    training_program_id: int = Field(foreign_key="hrd_training_programs.id")
    enrollment_date: datetime = Field(default_factory=datetime.utcnow)
    completion_date: Optional[datetime] = Field(default=None)
    completion_status: str = Field(default="enrolled")  # enrolled, completed, failed, withdrawn
    score: Optional[Decimal] = Field(default=None, decimal_places=2)
    certificate_issued: bool = Field(default=False)
    feedback: str = Field(default="", max_length=1000)

    # Relationships
    employee: HrdEmployee = Relationship(back_populates="training_enrollments")
    training_program: HrdTrainingProgram = Relationship(back_populates="enrollments")


# 10. Performance Reviews
class HrdPerformanceReview(SQLModel, table=True):
    __tablename__ = "hrd_performance_reviews"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="hrd_employees.id")
    reviewer_id: int = Field(foreign_key="hrd_employees.id")
    review_period_start: date
    review_period_end: date
    overall_rating: Decimal = Field(decimal_places=2)  # 1-5 scale
    goals_achievement: Decimal = Field(decimal_places=2)
    competency_scores: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    strengths: str = Field(max_length=2000)
    areas_for_improvement: str = Field(max_length=2000)
    development_plan: str = Field(max_length=2000)
    employee_comments: str = Field(default="", max_length=2000)
    reviewer_comments: str = Field(max_length=2000)
    is_final: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    employee: HrdEmployee = Relationship(back_populates="performance_reviews")


# 11. Documents Management
class HrdDocument(SQLModel, table=True):
    __tablename__ = "hrd_documents"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="hrd_employees.id")
    document_type: DocumentType
    title: str = Field(max_length=255)
    file_name: str = Field(max_length=255)
    file_path: str = Field(max_length=500)
    file_size: int  # bytes
    mime_type: str = Field(max_length=100)
    description: str = Field(default="", max_length=500)
    uploaded_by: int = Field(foreign_key="hrd_users.id")
    is_confidential: bool = Field(default=False)
    expiry_date: Optional[date] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    employee: HrdEmployee = Relationship(back_populates="documents")


# 12. Payroll Management
class HrdPayroll(SQLModel, table=True):
    __tablename__ = "hrd_payroll"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    employee_id: int = Field(foreign_key="hrd_employees.id")
    pay_period_start: date
    pay_period_end: date
    base_salary: Decimal = Field(decimal_places=2)
    overtime_pay: Decimal = Field(default=Decimal("0"), decimal_places=2)
    allowances: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    deductions: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    gross_pay: Decimal = Field(decimal_places=2)
    tax_deduction: Decimal = Field(decimal_places=2)
    net_pay: Decimal = Field(decimal_places=2)
    status: PayrollStatus = Field(default=PayrollStatus.DRAFT)
    processed_by: Optional[int] = Field(default=None, foreign_key="hrd_users.id")
    processed_at: Optional[datetime] = Field(default=None)
    payment_date: Optional[date] = Field(default=None)
    bank_reference: str = Field(default="", max_length=100)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    employee: HrdEmployee = Relationship(back_populates="payroll_records")


# 13. Company Holidays
class HrdHoliday(SQLModel, table=True):
    __tablename__ = "hrd_holidays"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)
    date: date
    description: str = Field(default="", max_length=500)
    is_recurring: bool = Field(default=False)
    is_working_day: bool = Field(default=False)  # If true, employees still work but get holiday pay
    created_by: int = Field(foreign_key="hrd_users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


# 14. System Settings
class HrdSetting(SQLModel, table=True):
    __tablename__ = "hrd_settings"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True, max_length=100)
    value: str = Field(max_length=2000)
    description: str = Field(default="", max_length=500)
    data_type: str = Field(default="string")  # string, integer, boolean, json
    is_system: bool = Field(default=False)  # System settings cannot be deleted
    updated_by: int = Field(foreign_key="hrd_users.id")
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# 15. Audit Log
class HrdAuditLog(SQLModel, table=True):
    __tablename__ = "hrd_audit_logs"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="hrd_users.id")
    action: str = Field(max_length=100)  # CREATE, UPDATE, DELETE, LOGIN, LOGOUT
    table_name: str = Field(max_length=100)
    record_id: Optional[int] = Field(default=None)
    old_values: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    new_values: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    ip_address: str = Field(max_length=45)
    user_agent: str = Field(default="", max_length=500)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# Non-persistent schemas for forms and API requests/responses


# Authentication schemas
class UserLogin(SQLModel, table=False):
    email: str = Field(max_length=255)
    password: str = Field(max_length=100)


class UserCreate(SQLModel, table=False):
    email: str = Field(max_length=255, regex=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
    password: str = Field(min_length=6, max_length=100)
    role: UserRole = Field(default=UserRole.EMPLOYEE)


# Employee schemas
class EmployeeCreate(SQLModel, table=False):
    employee_id: str = Field(max_length=50)
    user_id: int
    first_name: str = Field(max_length=100)
    last_name: str = Field(max_length=100)
    date_of_birth: date
    phone: str = Field(max_length=20)
    address: str = Field(max_length=500)
    emergency_contact_name: str = Field(max_length=100)
    emergency_contact_phone: str = Field(max_length=20)
    hire_date: date
    department_id: Optional[int] = Field(default=None)
    position_id: Optional[int] = Field(default=None)
    manager_id: Optional[int] = Field(default=None)


class EmployeeUpdate(SQLModel, table=False):
    first_name: Optional[str] = Field(default=None, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = Field(default=None, max_length=500)
    emergency_contact_name: Optional[str] = Field(default=None, max_length=100)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=20)
    department_id: Optional[int] = Field(default=None)
    position_id: Optional[int] = Field(default=None)
    manager_id: Optional[int] = Field(default=None)
    employment_status: Optional[EmploymentStatus] = Field(default=None)


# Attendance schemas
class AttendanceCheckIn(SQLModel, table=False):
    location: Optional[str] = Field(default=None, max_length=255)
    notes: str = Field(default="", max_length=500)


class AttendanceCheckOut(SQLModel, table=False):
    location: Optional[str] = Field(default=None, max_length=255)
    notes: str = Field(default="", max_length=500)


# Leave request schemas
class LeaveRequestCreate(SQLModel, table=False):
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: str = Field(max_length=1000)
    supporting_documents: List[str] = Field(default=[])


class LeaveRequestApproval(SQLModel, table=False):
    status: LeaveStatus
    rejection_reason: str = Field(default="", max_length=500)


# Department and Position schemas
class DepartmentCreate(SQLModel, table=False):
    name: str = Field(max_length=100)
    code: str = Field(max_length=20)
    description: str = Field(default="", max_length=500)
    manager_id: Optional[int] = Field(default=None)
    budget: Optional[Decimal] = Field(default=None, decimal_places=2)


class PositionCreate(SQLModel, table=False):
    title: str = Field(max_length=100)
    code: str = Field(max_length=20)
    description: str = Field(default="", max_length=1000)
    department_id: int
    level: str = Field(max_length=50)
    min_salary: Optional[Decimal] = Field(default=None, decimal_places=2)
    max_salary: Optional[Decimal] = Field(default=None, decimal_places=2)
    requirements: str = Field(default="", max_length=2000)


# Training schemas
class TrainingProgramCreate(SQLModel, table=False):
    title: str = Field(max_length=200)
    description: str = Field(max_length=2000)
    trainer: str = Field(max_length=200)
    duration_hours: int
    max_participants: Optional[int] = Field(default=None)
    cost_per_participant: Optional[Decimal] = Field(default=None, decimal_places=2)
    start_date: datetime
    end_date: datetime
    location: str = Field(max_length=255)
    prerequisites: str = Field(default="", max_length=1000)


# Performance review schemas
class PerformanceReviewCreate(SQLModel, table=False):
    employee_id: int
    review_period_start: date
    review_period_end: date
    overall_rating: Decimal = Field(decimal_places=2, ge=1, le=5)
    goals_achievement: Decimal = Field(decimal_places=2, ge=0, le=100)
    competency_scores: Dict[str, Any] = Field(default={})
    strengths: str = Field(max_length=2000)
    areas_for_improvement: str = Field(max_length=2000)
    development_plan: str = Field(max_length=2000)
    reviewer_comments: str = Field(max_length=2000)


# Dashboard statistics schemas
class DashboardStats(SQLModel, table=False):
    total_employees: int
    active_employees: int
    present_today: int
    on_leave_today: int
    pending_leave_requests: int
    upcoming_trainings: int
    recent_hires: int


class EmployeeStats(SQLModel, table=False):
    my_attendance_this_month: int
    my_leave_balance: Dict[str, int]
    my_upcoming_trainings: int
    my_pending_requests: int
