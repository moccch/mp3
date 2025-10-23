var User = require('../models/user');
var Task = require('../models/task');

module.exports = function (router) {
  
  // GET /api/users - Get all users
  router.route('/users')
    .get(function (req, res) {
      try {
        // Parse query parameters
        var whereQuery = req.query.where ? JSON.parse(req.query.where) : {};
        var sortQuery = req.query.sort ? JSON.parse(req.query.sort) : {};
        var selectQuery = req.query.select ? JSON.parse(req.query.select) : {};
        var skipNum = req.query.skip ? parseInt(req.query.skip) : 0;
        var limitNum = req.query.limit ? parseInt(req.query.limit) : 0; // 0 means no limit for users
        var countOnly = req.query.count === 'true';

        // If count is requested
        if (countOnly) {
          User.countDocuments(whereQuery)
            .then(count => {
              res.status(200).json({
                message: "OK",
                data: count
              });
            })
            .catch(err => {
              res.status(500).json({
                message: "Error counting users",
                data: {}
              });
            });
        } else {
          // Build query
          var query = User.find(whereQuery);
          
          if (Object.keys(sortQuery).length > 0) {
            query = query.sort(sortQuery);
          }
          if (Object.keys(selectQuery).length > 0) {
            query = query.select(selectQuery);
          }
          if (skipNum > 0) {
            query = query.skip(skipNum);
          }
          if (limitNum > 0) {
            query = query.limit(limitNum);
          }

          query.exec()
            .then(users => {
              res.status(200).json({
                message: "OK",
                data: users
              });
            })
            .catch(err => {
              res.status(500).json({
                message: "Error retrieving users",
                data: {}
              });
            });
        }
      } catch (err) {
        res.status(400).json({
          message: "Bad request - invalid query parameters",
          data: {}
        });
      }
    })
    // POST /api/users - Create a new user
    .post(async function (req, res) {
      try {
        // Validate required fields
        if (!req.body.name || !req.body.email) {
          return res.status(400).json({
            message: "Name and email are required",
            data: {}
          });
        }

        var user = new User();
        user.name = req.body.name;
        user.email = req.body.email;
        user.pendingTasks = req.body.pendingTasks || [];
        
        const savedUser = await user.save();

        // Two-way reference: Update tasks if pendingTasks were provided
        if (savedUser.pendingTasks && savedUser.pendingTasks.length > 0) {
          await Task.updateMany(
            { _id: { $in: savedUser.pendingTasks } },
            { $set: { assignedUser: savedUser._id.toString(), assignedUserName: savedUser.name } }
          );
        }

        res.status(201).json({
          message: "User created",
          data: savedUser
        });
      } catch (err) {
        if (err.code === 11000) {
          res.status(400).json({
            message: "User with this email already exists",
            data: {}
          });
        } else {
          res.status(500).json({
            message: "Error creating user",
            data: {}
          });
        }
      }
    });

  // GET /api/users/:id - Get a specific user
  router.route('/users/:id')
    .get(function (req, res) {
      try {
        var selectQuery = req.query.select ? JSON.parse(req.query.select) : {};
        
        var query = User.findById(req.params.id);
        
        if (Object.keys(selectQuery).length > 0) {
          query = query.select(selectQuery);
        }

        query.exec()
          .then(user => {
            if (!user) {
              return res.status(404).json({
                message: "User not found",
                data: {}
              });
            }
            res.status(200).json({
              message: "OK",
              data: user
            });
          })
          .catch(err => {
            res.status(404).json({
              message: "User not found",
              data: {}
            });
          });
      } catch (err) {
        res.status(400).json({
          message: "Bad request - invalid query parameters",
          data: {}
        });
      }
    })
    // PUT /api/users/:id - Replace entire user
    .put(async function (req, res) {
      try {
        // Validate required fields
        if (!req.body.name || !req.body.email) {
          return res.status(400).json({
            message: "Name and email are required",
            data: {}
          });
        }

        // Find the existing user
        const existingUser = await User.findById(req.params.id);
        
        if (!existingUser) {
          return res.status(404).json({
            message: "User not found",
            data: {}
          });
        }

        // Check if email is being changed and if new email already exists
        if (req.body.email !== existingUser.email) {
          const emailExists = await User.findOne({ email: req.body.email, _id: { $ne: req.params.id } });
          if (emailExists) {
            return res.status(400).json({
              message: "User with this email already exists",
              data: {}
            });
          }
        }

        // Store old pendingTasks
        const oldPendingTasks = existingUser.pendingTasks || [];
        const newPendingTasks = req.body.pendingTasks || [];

        // Update user
        existingUser.name = req.body.name;
        existingUser.email = req.body.email;
        existingUser.pendingTasks = newPendingTasks;

        const updatedUser = await existingUser.save();

        // Handle two-way reference for pendingTasks changes
        // Find tasks that were removed from pendingTasks
        const removedTasks = oldPendingTasks.filter(taskId => !newPendingTasks.includes(taskId));
        // Find tasks that were added to pendingTasks
        const addedTasks = newPendingTasks.filter(taskId => !oldPendingTasks.includes(taskId));

        // Unassign removed tasks
        if (removedTasks.length > 0) {
          await Task.updateMany(
            { _id: { $in: removedTasks } },
            { $set: { assignedUser: "", assignedUserName: "unassigned" } }
          );
        }

        // Assign added tasks
        if (addedTasks.length > 0) {
          await Task.updateMany(
            { _id: { $in: addedTasks } },
            { $set: { assignedUser: req.params.id, assignedUserName: req.body.name } }
          );
        }

        res.status(200).json({
          message: "User updated",
          data: updatedUser
        });

      } catch (err) {
        if (err.code === 11000) {
          res.status(400).json({
            message: "User with this email already exists",
            data: {}
          });
        } else if (err.kind === 'ObjectId') {
          res.status(404).json({
            message: "User not found",
            data: {}
          });
        } else {
          res.status(500).json({
            message: "Error updating user",
            data: {}
          });
        }
      }
    })
    // DELETE /api/users/:id - Delete user
    .delete(async function (req, res) {
      try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
          return res.status(404).json({
            message: "User not found",
            data: {}
          });
        }

        // Unassign all tasks assigned to this user (two-way reference)
        if (user.pendingTasks && user.pendingTasks.length > 0) {
          await Task.updateMany(
            { _id: { $in: user.pendingTasks } },
            { $set: { assignedUser: "", assignedUserName: "unassigned" } }
          );
        }

        await User.findByIdAndDelete(req.params.id);

        res.status(200).json({
          message: "User deleted",
          data: user
        });

      } catch (err) {
        if (err.kind === 'ObjectId') {
          res.status(404).json({
            message: "User not found",
            data: {}
          });
        } else {
          res.status(500).json({
            message: "Error deleting user",
            data: {}
          });
        }
      }
    });

  return router;
};

