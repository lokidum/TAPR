import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/booking/data/booking_detail_models.dart';

class BookingDetailRepository {
  BookingDetailRepository(this._dio);

  final Dio _dio;

  Future<BookingDetail> fetchBooking(String bookingId) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/bookings/$bookingId',
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final booking = data['booking'] as Map<String, dynamic>;
    return BookingDetail.fromJson(booking);
  }

  Future<BookingDetail> confirmBooking(String bookingId) async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '/bookings/$bookingId/confirm',
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final booking = data['booking'] as Map<String, dynamic>;
    return BookingDetail.fromJson(booking);
  }

  Future<BookingDetail> completeBooking(String bookingId) async {
    final response = await _dio.patch<Map<String, dynamic>>(
      '/bookings/$bookingId/complete',
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final booking = data['booking'] as Map<String, dynamic>;
    return BookingDetail.fromJson(booking);
  }

  Future<BookingDetail> submitReview(
    String bookingId, {
    required int cutRating,
    required int experienceRating,
    String? reviewText,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/bookings/$bookingId/review',
      data: {
        'cutRating': cutRating,
        'experienceRating': experienceRating,
        if (reviewText != null && reviewText.isNotEmpty) 'reviewText': reviewText,
      },
    );
    final data = response.data!['data'] as Map<String, dynamic>;
    final booking = data['booking'] as Map<String, dynamic>;
    return BookingDetail.fromJson(booking);
  }

  Future<void> raiseDispute(
    String bookingId, {
    required String reason,
    List<String> evidenceUrls = const [],
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/bookings/$bookingId/dispute',
      data: {
        'reason': reason,
        if (evidenceUrls.isNotEmpty) 'evidenceUrls': evidenceUrls,
      },
    );
  }
}

final bookingDetailRepositoryProvider = Provider<BookingDetailRepository>((ref) {
  return BookingDetailRepository(ref.read(dioProvider));
});
