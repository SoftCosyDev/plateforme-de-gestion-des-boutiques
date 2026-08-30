# admin : module d'administration Django.
from django.contrib import admin

from .models import AttendanceRecord, EmployeeProfile


@admin.register(EmployeeProfile)
class EmployeeProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'boutique', 'role', 'access_role', 'status')
    list_filter = ('boutique', 'access_role', 'status')
    search_fields = ('user__full_name', 'role')


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'type', 'justified')
    list_filter = ('boutique', 'type', 'justified')
