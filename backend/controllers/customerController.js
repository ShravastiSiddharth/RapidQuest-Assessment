const connectDB = require('../services/database');
const { ObjectId } = require('mongodb');


async function getNewCustomersOverTime(req, res) {
    const { interval, startDate, endDate } = req.body;
    const db = await connectDB();
    const collection = db.collection('shopifyCustomers');


    let dateFormat;
    switch (interval) {
        case 'yearly':
            dateFormat = "%Y";
            break;
        case 'monthly':
            dateFormat = "%Y-%m";
            break;
        case 'quarterly':
            additionalFields = {
                quarter: {
                    $ceil: { $divide: [{ $month: "$createdAtDate" }, 3] }
                }
            };
            break;
        default:
            dateFormat = "%Y-%m-%d";
    }


    let matchQuery = {};
    if (startDate || endDate) {
        matchQuery = {
            createdAtDate: {}
        };
        if (startDate) matchQuery.createdAtDate.$gte = new Date(startDate);
        if (endDate) matchQuery.createdAtDate.$lte = new Date(endDate);
    }

    const customers = await collection.aggregate([
        {
            $addFields: {
                createdAtDate: {
                    $dateFromString: {
                        dateString: { $substr: ["$created_at", 0, 19] },
                        format: "%Y-%m-%dT%H:%M:%S"
                    }
                }
            }
        },
        { $match: matchQuery }, 
        {
            $group: {
                _id: { $dateToString: { format: dateFormat, date: "$createdAtDate" } },
                newCustomers: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]).toArray();

    res.json(customers);
}



async function getRepeatCustomers(req, res) {
    const { interval, startDate, endDate } = req.body; 
    const db = await connectDB();
    const ordersCollection = db.collection('shopifyOrders');

   
    let dateFilter = {};
    if (startDate && endDate) {
        dateFilter = {
            createdAtDate: {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        };
    }

   
    let groupFormat;
    switch (interval) {
        case 'yearly':
            groupFormat = "%Y";
            break;
        case 'quarterly':
            groupFormat = { 
                $concat: [
                    { $toString: { $year: "$createdAtDate" } }, 
                    "-Q", 
                    { $toString: { $ceil: { $divide: [{ $month: "$createdAtDate" }, 3] } } }
                ]
            };
            break;
        case 'monthly':
            groupFormat = "%Y-%m";
            break;
        case 'custom':
         
            groupFormat = "%Y-%m";
            break;
        default:
            groupFormat = "%Y-%m-%d";
            break;
    }

   
    const repeatCustomers = await ordersCollection.aggregate([
        {
            $addFields: {
                createdAtDate: {
                    $dateFromString: {
                        dateString: { $substr: ["$created_at", 0, 19] },
                        format: "%Y-%m-%dT%H:%M:%S"
                    }
                }
            }
        },
        {
            $match: dateFilter
        },
        {
            $group: {
                _id: {
                    customer_id: "$customer.id",
                    period: { $dateToString: { format: groupFormat, date: "$createdAtDate" } }
                },
                orderCount: { $sum: 1 }
            }
        },
        {
            $match: {
                orderCount: { $gt: 1 }
            }
        },
        {
            $group: {
                _id: "$_id.period", 
                repeatCustomers: { $sum: 1 } 
            }
        },
        { 
            $sort: { _id: 1 }
        } 
    ]).toArray();

    res.json(repeatCustomers);
}




async function getCustomerDistribution(req, res) {
    const db = await connectDB();
    const collection = db.collection('shopifyCustomers');

    const distribution = await collection.aggregate([
        {
            $group: {
                _id: "$default_address.city",
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]).toArray();

    res.json(distribution);
}



// async function getCustomerLifetimeValue(req, res) {
//     const db = await connectDB();
//     const collection = db.collection('shopifyCustomers');

//     const lifetimeValue = await collection.aggregate([
//         {
//             $group: {
//                 _id: { $dateToString: { format: "%Y-%m", date: "$createdAtDate" } },
//                 totalSpent: { $sum: { $toDouble: "$total_spent" } },
//                 customers: { $sum: 1 }
//             }
//         },
//         { $sort: { _id: 1 } }
//     ]).toArray();

//     res.json(lifetimeValue);
// }


function getDateFormat(interval) {
    switch (interval) {
        case 'yearly':
            return "%Y";
        case 'quarterly':
            return "%Y-Q%q"; // Quarter is calculated separately
        case 'monthly':
        default:
            return "%Y-%m";
    }
}

async function getCustomerLifetimeValue(req, res) {
    const { interval = 'monthly', startDate, endDate } = req.body; // Example: interval=monthly, yearly, quarterly, custom
    const db = await connectDB();
    const customersCollection = db.collection('shopifyCustomers');
    const ordersCollection = db.collection('shopifyOrders');
    
    // Parse date strings to actual Date objects
    const start = startDate ? new Date(startDate) : new Date("1970-01-01");
    const end = endDate ? new Date(endDate) : new Date();

    // Aggregate the data
    const lifetimeValue = await customersCollection.aggregate([
        {
            $match: {
                created_at: { $gte: start.toISOString(), $lte: end.toISOString() }
            }
        },
        {
            $lookup: {
                from: "shopifyOrders",
                localField: "_id",
                foreignField: "customer.id",
                as: "orders"
            }
        },
        {
            $unwind: "$orders"
        },
        {
            $group: {
                _id: {
                    interval: { $dateToString: { format: getDateFormat(interval), date: { $dateFromString: { dateString: "$created_at" } } } },
                    customer: "$_id"
                },
                totalSpent: { $sum: { $toDouble: "$orders.total_price" } }
            }
        },
        {
            $group: {
                _id: "$_id.interval",
                totalSpent: { $sum: "$totalSpent" },
                customers: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]).toArray();

    res.json(lifetimeValue);
}


module.exports = {
    getNewCustomersOverTime,
    getRepeatCustomers,
    getCustomerDistribution,
    getCustomerLifetimeValue


};
