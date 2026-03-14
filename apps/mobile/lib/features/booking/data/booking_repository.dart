import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/booking/data/booking_models.dart';

class BookingRepository {
  BookingRepository(this._dio);

  final Dio _dio;

  Future<List<BarberServiceModel>> fetchServices(String barberId) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/$barberId/services',
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final raw = data['services'] as List<dynamic>;
    return raw
        .map((e) => BarberServiceModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<BookedSlot>> fetchAvailability(
    String barberId,
    String date,
  ) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/barbers/$barberId/availability',
      queryParameters: {'date': date},
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final raw = data['slots'] as List<dynamic>;
    return raw
        .map((e) => BookedSlot.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<BookingResult> createBooking({
    required String barberId,
    required String serviceId,
    required String serviceType,
    required String scheduledAt,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/bookings',
      data: {
        'barberId': barberId,
        'serviceId': serviceId,
        'serviceType': serviceType,
        'scheduledAt': scheduledAt,
      },
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    return BookingResult.fromJson(data);
  }
}

final bookingRepositoryProvider = Provider<BookingRepository>((ref) {
  return BookingRepository(ref.read(dioProvider));
});
