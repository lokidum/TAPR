import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/barber/data/barber_dashboard_models.dart';

class BarberDashboardRepository {
  BarberDashboardRepository(this._dio);

  final Dio _dio;

  Future<BarberDashboardStats> fetchStats() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/bookings/barber/stats',
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return BarberDashboardStats.fromJson(data);
  }

  Future<List<UpcomingBookingCard>> fetchUpcoming() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/bookings/barber/upcoming',
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final raw = data['bookings'] as List<dynamic>;
    return raw
        .map((e) => UpcomingBookingCard.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> acknowledgeLevelUp() async {
    await _dio.patch<Map<String, dynamic>>(
      '/barbers/me',
      data: {'levelUpPending': false},
    );
  }

  Future<void> goOnCall(double lat, double lng) async {
    await _dio.post<Map<String, dynamic>>(
      '/barbers/me/on-call',
      data: {'lat': lat, 'lng': lng},
    );
  }

  Future<void> goOffCall() async {
    await _dio.delete<Map<String, dynamic>>('/barbers/me/on-call');
  }
}

final barberDashboardRepositoryProvider =
    Provider<BarberDashboardRepository>((ref) {
  return BarberDashboardRepository(ref.read(dioProvider));
});
